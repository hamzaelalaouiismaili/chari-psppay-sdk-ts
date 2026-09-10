import {
  BadRequestException,
  Inject,
  Injectable,
  UseGuards,
  createParamDecorator,
  type CanActivate,
  type DynamicModule,
  type ExecutionContext,
  type ModuleMetadata,
  type Provider,
} from '@nestjs/common';
import { ChariPay, type ChariPayConfig } from '@chari-pay/sdk';
import { ChariPaySignatureVerificationError, ChariPayWebhookSetupError } from '@chari-pay/sdk';
import { parseEvent, verifyWebhookSignature } from '@chari-pay/sdk/webhooks';
import type { ChariPayEvent } from '@chari-pay/sdk';

/** Injection token for the raw options object. */
export const CHARI_PAY_OPTIONS = Symbol('CHARI_PAY_OPTIONS');

export type ChariPayModuleOptions = ChariPayConfig;

export interface ChariPayModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  inject?: unknown[];
  useFactory: (...args: never[]) => ChariPayModuleOptions | Promise<ChariPayModuleOptions>;
}

/** Where the verified event is stashed on the request. */
const EVENT_KEY = 'chariPayEvent';

/**
 * Registers a configured `ChariPay` client and the webhook guard.
 *
 * ```ts
 * @Module({
 *   imports: [ChariPayModule.forRoot({
 *     apiKey: process.env.CHARI_PAY_API_KEY!,
 *     webhookSecret: process.env.CHARI_PAY_WEBHOOK_SECRET!,
 *   })],
 * })
 * export class AppModule {}
 * ```
 *
 * Create the app with `NestFactory.create(AppModule, { rawBody: true })` —
 * without it the untouched bytes are gone and no signature can be verified.
 */
export class ChariPayModule {
  static forRoot(options: ChariPayModuleOptions): DynamicModule {
    return {
      module: ChariPayModule,
      global: true,
      providers: [
        { provide: CHARI_PAY_OPTIONS, useValue: options },
        ChariPayModule.clientProvider(),
        ChariPayWebhookGuard,
      ],
      exports: [ChariPay, CHARI_PAY_OPTIONS, ChariPayWebhookGuard],
    };
  }

  static forRootAsync(options: ChariPayModuleAsyncOptions): DynamicModule {
    return {
      module: ChariPayModule,
      global: true,
      imports: options.imports ?? [],
      providers: [
        {
          provide: CHARI_PAY_OPTIONS,
          useFactory: options.useFactory,
          inject: (options.inject ?? []) as never[],
        },
        ChariPayModule.clientProvider(),
        ChariPayWebhookGuard,
      ],
      exports: [ChariPay, CHARI_PAY_OPTIONS, ChariPayWebhookGuard],
    };
  }

  private static clientProvider(): Provider {
    return {
      provide: ChariPay,
      useFactory: (options: ChariPayModuleOptions) => new ChariPay(options),
      inject: [CHARI_PAY_OPTIONS],
    };
  }
}

/**
 * Verifies the delivery before the handler runs, then stores the typed event
 * for `@ChariPayEventPayload()`.
 */
@Injectable()
export class ChariPayWebhookGuard implements CanActivate {
  constructor(@Inject(CHARI_PAY_OPTIONS) private readonly options: ChariPayModuleOptions) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      rawBody?: Buffer;
      headers: Record<string, string | string[] | undefined>;
      [EVENT_KEY]?: ChariPayEvent;
    }>();

    const secret = this.options.webhookSecret;
    if (!secret || (Array.isArray(secret) && secret.length === 0)) {
      throw new ChariPayWebhookSetupError(
        'ChariPayModule was configured without `webhookSecret`, so deliveries cannot be verified.',
      );
    }

    if (!Buffer.isBuffer(req.rawBody)) {
      throw new ChariPayWebhookSetupError(
        'req.rawBody is missing. Create the app with NestFactory.create(AppModule, { rawBody: true }) — ' +
          're-serialising the parsed body would change the signature.',
      );
    }

    try {
      verifyWebhookSignature({
        rawBody: req.rawBody,
        headers: req.headers,
        secret,
      });
      req[EVENT_KEY] = parseEvent(req.rawBody, req.headers);
    } catch (error) {
      if (error instanceof ChariPaySignatureVerificationError) {
        throw new BadRequestException({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }

    return true;
  }
}

/** Applies `ChariPayWebhookGuard` to a route handler. */
export const ChariPayWebhook = (): MethodDecorator => UseGuards(ChariPayWebhookGuard);

/**
 * Supplies the verified, typed event to a handler parameter.
 *
 * ```ts
 * @Post('chari-pay')
 * @ChariPayWebhook()
 * handle(@ChariPayEventPayload() event: ChariPayEvent) {}
 * ```
 */
export const ChariPayEventPayload = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ChariPayEvent => {
    const req = context.switchToHttp().getRequest<{ [EVENT_KEY]?: ChariPayEvent }>();
    const event = req[EVENT_KEY];
    if (!event) {
      throw new ChariPayWebhookSetupError(
        '@ChariPayEventPayload() found no event. Add @ChariPayWebhook() to the handler.',
      );
    }
    return event;
  },
);

export { ChariPay };
export type { ChariPayEvent };
