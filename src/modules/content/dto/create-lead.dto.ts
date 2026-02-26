export class CreateLeadDto {
  tgUserId: string;
  name: string;
  phone: string;
  city: string;
  message: string;
  productId?: string;
  status: 'NEW' | 'IN_PROGRESS' | 'DONE' | 'SPAM';
  source: 'BOT' | 'WEBAPP';
}