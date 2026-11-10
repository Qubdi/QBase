-- recovery codes were stored as a bare sha256 (oldest) or an unprefixed HMAC; the two cannot be told apart,
-- and the bare sha256 can be tested offline, so every code stored without the 'k1:' prefix is dropped.
-- People who turned two-factor on keep their authenticator and renew the codes in their account settings.
DELETE FROM "mfa_recovery_codes" WHERE "code_hash" NOT LIKE 'k1:%';
