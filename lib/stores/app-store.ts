import { create } from 'zustand';

type AuthStoreProps = {
  loaded: boolean;
  signed_in: boolean | null;

  user: {
    created_at: string | null;
    updated_at: string | null;
    id: string | null;
    email: string | null;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    full_name: string | null;
  };

  // Common setters
  setLoaded: (value: boolean) => void;
  setSignedIn: (value: boolean | null) => void;
  setUser: (user_data: Partial<AuthStoreProps['user']>) => void;
};

const initial_auth_state = {
  loaded: false,
  signed_in: null,
};

const initial_user_state: AuthStoreProps['user'] = {
  created_at: null,
  updated_at: null,
  id: null,
  email: null,
  username: null,
  first_name: null,
  last_name: null,
  full_name: null,
};

export const useAuthStore = create<AuthStoreProps>((set) => ({
  ...initial_auth_state,
  user: initial_user_state,

  // Common setters
  setLoaded: (value: boolean) => set({ loaded: value }),
  setSignedIn: (value: boolean | null) => set({ signed_in: value }),

  setUser: (data) =>
    set((state) => ({
      user: {
        ...state.user,
        ...data,
        full_name: [data.first_name || state.user.first_name, data.last_name || state.user.last_name].filter(Boolean).join(' '),
      },
    })),
}));
