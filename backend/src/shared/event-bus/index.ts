import { EventEmitter } from "node:events";

type EventMap = Record<string, unknown>;

class TypedEventBus<Events extends EventMap> {
  private emitter = new EventEmitter();

  emit<K extends keyof Events & string>(event: K, payload: Events[K]) {
    this.emitter.emit(event, payload);
  }

  on<K extends keyof Events & string>(event: K, handler: (payload: Events[K]) => void) {
    this.emitter.on(event, handler);
  }
}

// Modules add their own events here as they're built, e.g. "user.created".
export interface AppEvents extends EventMap {}

export const eventBus = new TypedEventBus<AppEvents>();
