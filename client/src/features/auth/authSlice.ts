import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { authApi } from '@/lib/api';
import { ApiRequestError } from '@/lib/apiClient';
import { clearUserQueries } from '@/lib/queryClient';
import type { User } from '@/types/api';

/**
 * Session identity is genuinely global client state — the header, route guards and
 * admin shell all read it — so it belongs in Redux. Note what is *not* here: no tokens.
 * They live in HTTP-only cookies the browser attaches automatically and JS cannot read.
 */
interface AuthState {
  user: User | null;
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated';
  /** Distinguishes "app is booting, we don't know yet" from "definitely signed out". */
  initialised: boolean;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  status: 'idle',
  initialised: false,
  error: null,
};

/**
 * A free-tier API sleeps when idle and can take a minute to wake. Until it answers, the
 * session is unknown — not signed out — so transient failures are retried for this long.
 */
const BOOTSTRAP_BUDGET_MS = 90_000;
const BOOTSTRAP_RETRY_DELAY_MS = 3_000;

/** Runs once on mount: asks the server who the cookie belongs to. */
export const bootstrapSession = createAsyncThunk<User | null>('auth/bootstrap', async () => {
  const deadline = Date.now() + BOOTSTRAP_BUDGET_MS;

  for (;;) {
    try {
      const { user } = await authApi.me();
      return user;
    } catch (error) {
      // A 401 here is the normal anonymous case, not an error worth surfacing. A timeout
      // or 5xx is the API still waking up; answering "signed out" to that would drop a
      // perfectly valid session.
      const transient =
        error instanceof ApiRequestError && (error.status === 0 || error.status >= 500);
      if (!transient || Date.now() + BOOTSTRAP_RETRY_DELAY_MS > deadline) return null;

      await new Promise((resolve) => setTimeout(resolve, BOOTSTRAP_RETRY_DELAY_MS));
    }
  }
});

export const login = createAsyncThunk<
  User,
  { email: string; password: string },
  { rejectValue: string }
>('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const { user } = await authApi.login(credentials);
    return user;
  } catch (error) {
    const message =
      error instanceof ApiRequestError ? error.message : 'Unable to sign in. Please try again.';
    return rejectWithValue(message);
  }
});

export const register = createAsyncThunk<
  User,
  { firstName: string; lastName: string; email: string; password: string; phone?: string },
  { rejectValue: string }
>('auth/register', async (payload, { rejectWithValue }) => {
  try {
    const { user } = await authApi.register(payload);
    return user;
  } catch (error) {
    const message =
      error instanceof ApiRequestError ? error.message : 'Unable to create your account.';
    return rejectWithValue(message);
  }
});

export const logout = createAsyncThunk('auth/logout', async () => {
  // `pending` has already signed the user out locally; drop their cached data in the
  // same tick, before anything re-renders with it.
  clearUserQueries();

  try {
    await authApi.logout();
  } catch {
    // Even if the server call fails, the local session must still be cleared.
  }
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /** Called by the axios interceptor when a refresh finally fails. */
    sessionExpired(state) {
      state.user = null;
      state.status = 'unauthenticated';
      state.error = null;
    },
    setUser(state, action: PayloadAction<User>) {
      state.user = action.payload;
      state.status = 'authenticated';
    },
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(bootstrapSession.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(bootstrapSession.fulfilled, (state, action) => {
        state.user = action.payload;
        state.status = action.payload ? 'authenticated' : 'unauthenticated';
        state.initialised = true;
      })
      .addCase(bootstrapSession.rejected, (state) => {
        state.status = 'unauthenticated';
        state.initialised = true;
      })
      .addCase(login.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.user = action.payload;
        state.status = 'authenticated';
        state.initialised = true;
      })
      .addCase(login.rejected, (state, action) => {
        state.status = 'unauthenticated';
        state.error = action.payload ?? 'Sign in failed';
      })
      .addCase(register.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(register.fulfilled, (state, action) => {
        state.user = action.payload;
        state.status = 'authenticated';
        state.initialised = true;
      })
      .addCase(register.rejected, (state, action) => {
        state.status = 'unauthenticated';
        state.error = action.payload ?? 'Registration failed';
      })
      // Signed out the moment it is asked for, not when the server answers: a cold API can
      // take seconds, and the account UI must not linger over a session the user ended.
      .addCase(logout.pending, (state) => {
        state.user = null;
        state.status = 'unauthenticated';
        state.error = null;
      });
  },
});

export const { sessionExpired, setUser, clearError } = authSlice.actions;
export default authSlice.reducer;
