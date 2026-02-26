export class CreateOrderDto {
  tgUserId: string;
  productId: string;
  qty: number;
  unit: string;
  address?: string;
  comment?: string;
  status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
}