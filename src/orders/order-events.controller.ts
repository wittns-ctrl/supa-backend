import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Sse,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { Types } from 'mongoose';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { OrderEventsService } from './order-events.service';
import { SseTicketsService } from './sse-tickets.service';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrderEventsController {
  constructor(
    private readonly orderEvents: OrderEventsService,
    private readonly tickets: SseTicketsService,
    private readonly ordersService: OrdersService,
  ) {}

  /**
   * Step 1 — authenticated ticket issuance. EventSource cannot send headers,
   * so the JWT-authed client fetches a 30-second single-use ticket first.
   */
  @Post(':id/ticket')
  @UseGuards(JwtAuthGuard)
  async issueTicket(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid order id');
    }
    return { ticket: await this.tickets.issue(id, user.id, user.role) };
  }

  /**
   * Step 2 — the SSE stream. Auth via one-time ticket; ownership enforced by
   * loading the order through OrdersService.findOne (same customer/owner/admin
   * checks as every other order endpoint). updateStatus() publishes events to
   * OrderEventsService, which are relayed here in real time.
   */
  @Sse(':id/stream')
  async stream(
    @Param('id') id: string,
    @Query('ticket') ticket: string,
    @Req() req: any,
  ): Promise<Observable<{ type: string; data: unknown }>> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid order id');
    }

    const entry = await this.tickets.consume(ticket);
    if (!entry || entry.orderId !== id) {
      throw new UnauthorizedException('Invalid or expired stream ticket');
    }

    // Ownership check — same authorization as GET /orders/:id
    const order = await this.ordersService.findOne(
      id,
      entry.userId,
      entry.userRole,
    );

    const subject = new Subject<{ type: string; data: unknown }>();
    let closed = false;

    // Relay pub/sub events into the stream
    const unsubscribe = this.orderEvents.subscribe(id, (event) => {
      if (!closed) subject.next({ type: 'update', data: event });
    });

    // Catch-up: status changed while connecting → send it immediately
    const last = await this.orderEvents.lastEventFor(id);
    if (last && last.status !== (order as { status?: string }).status) {
      subject.next({ type: 'update', data: last });
    }

    // Heartbeat keeps idle connections alive through proxies
    const ping = setInterval(() => {
      if (!closed) subject.next({ type: 'ping', data: { t: Date.now() } });
    }, 25_000);

    // Cleanup on client disconnect (req close fires even without @Res)
    req.on('close', () => {
      if (closed) return;
      closed = true;
      clearInterval(ping);
      unsubscribe();
      subject.complete();
    });

    return subject.asObservable();
  }
}
