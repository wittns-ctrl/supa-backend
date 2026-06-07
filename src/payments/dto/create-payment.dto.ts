export class CreatePaymentDto {
  orderId?: string;
  bookingId?: string;
  amount!: number;
  transactionId?: string;
}
