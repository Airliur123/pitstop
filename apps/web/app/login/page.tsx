import { safeAuthReturnTo } from '@pitstop/validation';

import { LoginForm, type LoginState } from '../../components/login-form';

const loginStates = new Set<LoginState>(['expired', 'invalid', 'unavailable']);

export default async function LoginPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const parameters = await searchParams;
  const rawState = typeof parameters.state === 'string' ? parameters.state : undefined;
  const state =
    rawState && loginStates.has(rawState as LoginState) ? (rawState as LoginState) : undefined;
  return (
    <LoginForm returnTo={safeAuthReturnTo(parameters.returnTo)} {...(state ? { state } : {})} />
  );
}
