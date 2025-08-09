import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import serverlessExpress from '@vendia/serverless-express';
import cookieParser from 'cookie-parser';
import { Handler, Context, Callback } from 'aws-lambda';
import session = require('express-session');

let server: Handler;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'a_very_secret_session_key',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 15, // 15 minutes
      },
    }),
  );

  await app.init();
  const expressApp = app.getHttpAdapter().getInstance();
  return serverlessExpress({ app: expressApp });
}

export const handler: Handler = async (
  event: any,
  context: Context,
  callback: Callback,
) => {
  server = server ?? (await bootstrap());
  return server(event, context, callback);
};

// Start the server when running directly
if (require.main === module) {
  async function start() {
    const app = await NestFactory.create(AppModule);
    app.use(cookieParser());
    app.use(
      session({
        secret: process.env.SESSION_SECRET || 'a_very_secret_session_key',
        resave: false,
        saveUninitialized: false,
        cookie: {
          httpOnly: true,
          secure: false, // In local dev, secure is false
          maxAge: 1000 * 60 * 15, // 15 minutes
        },
      }),
    );
    await app.listen(process.env.PORT ?? 3000);
    console.log(`NestJS server started on port ${process.env.PORT ?? 3000}`);
  }

  start().catch(err => {
    console.error('Failed to start server:', err);
  });
}
