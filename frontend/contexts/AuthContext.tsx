import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface ProfileUpdate {
  full_name?: string;
  phone?: string;
  avatar_url?: string;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updateProfile: (data: ProfileUpdate) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  uploadAvatar: (localUri: string) => Promise<{ url: string | null; error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error ? error.message : null };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? error.message : null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  // Full name / phone / avatar are stored in Supabase auth's user_metadata
  // (`data` here) rather than a separate profile table — there's no other
  // per-user profile data yet, so a dedicated table would be premature.
  const updateProfile = useCallback(async (data: ProfileUpdate) => {
    const { error } = await supabase.auth.updateUser({ data });
    return { error: error ? error.message : null };
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error ? error.message : null };
  }, []);

  const uploadAvatar = useCallback(async (localUri: string) => {
    if (!session?.user) return { url: null, error: 'Not signed in' };
    try {
      const response = await fetch(localUri);
      const blob = await response.blob();
      const ext = localUri.split('.').pop()?.toLowerCase().split('?')[0] || 'jpg';
      const path = `${session.user.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, blob, {
          contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
          upsert: true,
        });
      if (uploadError) return { url: null, error: uploadError.message };

      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      // Cache-bust: the path is stable (upsert overwrites it), so without this
      // the app/CDN would keep showing the previous image after a re-upload.
      return { url: `${data.publicUrl}?t=${Date.now()}`, error: null };
    } catch (e: any) {
      return { url: null, error: e?.message || 'Upload failed' };
    }
  }, [session]);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    loading,
    signUp,
    signIn,
    signOut,
    updateProfile,
    updatePassword,
    uploadAvatar,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
