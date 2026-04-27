/**
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { AuthenticatonType, Config } from "./types";

const config: Config = {
  location: "asia-east1",
  database: "(default)",
  databaseRegion: "asia-east1",
  mailCollection: "mail",
  smtpConnectionUri: "smtps://esther.shih%40microfusion.cloud@smtp.gmail.com:465",
  smtpPassword: process.env.SMTP_PASSWORD, // This will be injected via secret
  defaultFrom: "esther.shih@microfusion.cloud",
  defaultReplyTo: "esther.shih@microfusion.cloud",
  usersCollection: process.env.USERS_COLLECTION,
  templatesCollection: process.env.TEMPLATES_COLLECTION,
  testing: false,
  TTLExpireType: "never",
  TTLExpireValue: 1,
  tls: "{}",
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  user: "esther.shih@microfusion.cloud",
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  refreshToken: process.env.REFRESH_TOKEN,
  authenticationType: AuthenticatonType.UsernamePassword,
};

export default config;
