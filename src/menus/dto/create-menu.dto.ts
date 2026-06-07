export class CreateMenuDto {
  restaurant!: string;
  name!: string;
  description!: string;
  price!: number;
  category!: string;
  image?: string;
  isAvailable?: boolean;
  spicy?: boolean;
  veg?: boolean;
}
