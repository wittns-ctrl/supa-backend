export class CreateBookingDto {
  customerId!: string;
  restaurantId!: string;
  bookingDate!: string;
  bookingTime!: string;
  guests!: number;
  specialRequest?: string;
}
