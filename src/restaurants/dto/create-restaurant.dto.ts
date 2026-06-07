export class LocationDto {
  address!: string;
  city!: string;
  latitude!: number;
  longitude!: number;
}

export class CreateRestaurantDto {
  name!: string;
  description!: string;
  ownerId!: string;
  location!: LocationDto;
  phone!: number;
  opening!: string;
  capacity!: number;
  images?: string[];
  cuisine?: string;
  amenities?: string[];
  verificationDocs?: string[];
}
