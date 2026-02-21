export class MediaReceivedEvent {
  constructor(
    public readonly mediaId: string,
    public readonly caption: string,
    public readonly mediaUrl: string,
    public readonly mediaType: string,
    public readonly permalink: string,
    public readonly timestamp: string,
  ) {}
}
