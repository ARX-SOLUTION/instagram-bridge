import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('instagram_posts')
export class InstagramPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  mediaId: string;

  @Column({ type: 'text', nullable: true })
  caption: string;

  @Column({ type: 'text', nullable: true })
  mediaUrl: string;

  @CreateDateColumn()
  @Index()
  createdAt: Date;

  @Column({ default: false })
  forwarded: boolean;
}
