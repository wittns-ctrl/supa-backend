export class OrderItemDto {
  menuItemId!: string;
  qty!: number;
}

export class DeliveryAddressDto {
  street?: string;
  apartment?: string;
  city?: string;
  postalCode?: string;
  instructions?: string;
}

export class CreateOrderDto {
  customerId!: string;
  restaurantId!: string;
  items!: OrderItemDto[];
  deliveryAddress?: DeliveryAddressDto;
  timeSlot?: string;
  promoCode?: string;
}
