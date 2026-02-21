import { ConsoleLogger, Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class AppLogger extends ConsoleLogger {
  // Custom logger implementation can go here
  // For now, it just extends ConsoleLogger to be production-ready (JSON formatting can be added here)
}
