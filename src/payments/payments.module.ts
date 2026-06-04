import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import {MongooseModule} from "@nestjs/mongoose";
import { payment,paymentschema } from './schema/payments.schema';

@Module({
  imports:[MongooseModule.forFeature([{name:payment.name,schema:paymentschema}])],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
