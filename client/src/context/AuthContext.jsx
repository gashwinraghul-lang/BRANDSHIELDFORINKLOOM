// client/src/context/AuthContext.jsx
import { createContext, useContext, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { endpoints, ApiError } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: endpoints.me,
    retry: false,
    staleTime: 60_000,
  });

  const loginMutation = useMutation({
    mutationFn: endpoints.login,
    onSuccess: (data) => {
      queryClient.setQueryData(['me'], { user: data.user });
      queryClient.invalidateQueries();
    },
  });

  const signupMutation = useMutation({
    mutationFn: endpoints.signup,
    onSuccess: (data) => {
      queryClient.setQueryData(['me'], { user: data.user });
      queryClient.invalidateQueries();
    },
  });

  const logoutMutation = useMutation({
    mutationFn: endpoints.logout,
    onSettled: () => {
      queryClient.clear();
    },
  });

  const value = useMemo(() => {
    const error = meQuery.error;
    const unauthenticated = error instanceof ApiError && error.status === 401;
    return {
      user: meQuery.data?.user || null,
      loading: meQuery.isLoading && !unauthenticated,
      isAuthed: Boolean(meQuery.data?.user),
      login: loginMutation.mutateAsync,
      loginState: loginMutation,
      signup: signupMutation.mutateAsync,
      signupState: signupMutation,
      logout: logoutMutation.mutateAsync,
      refreshUser: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
    };
  }, [meQuery.data, meQuery.isLoading, meQuery.error, loginMutation, signupMutation, logoutMutation, queryClient]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
