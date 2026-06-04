export class CreateAuthDto {
  name!: string;
  email!: string;
  password!: string;
  phone!: Number;
  role!: string;
  profile?: {
    bio?: string;
    imageurl?: string;
  };
}
