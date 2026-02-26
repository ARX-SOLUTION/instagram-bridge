export class InstagramActivityEvent {
  constructor(
    public readonly type: string,
    public readonly message: string,
  ) {}
}
