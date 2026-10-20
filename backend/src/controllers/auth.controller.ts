import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import crypto from 'crypto';
import { config } from '../config';
import { supabase, isSupabaseConfigured, inMemoryDb, UserRecord } from '../services/supabase';
import { emailService } from '../services/email.service';
import { AuthRequest } from '../middleware/auth.middleware';

const registerSchema = z.object({
  indexNumber: z.string().min(3, 'Index number is required'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Valid university email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const verifyEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6, 'Verification code must be 6 digits'),
});

const loginSchema = z.object({
  identifier: z.string().min(1, 'Email or University Index Number required'),
  password: z.string().min(1, 'Password required'),
});

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ success: false, errors: parseResult.error.flatten().fieldErrors });
      return;
    }

    const { indexNumber, name, email, password } = parseResult.data;
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedIndex = indexNumber.toUpperCase().trim();

    // Check if user already exists
    if (isSupabaseConfigured && supabase) {
      const { data: existingUser } = await supabase
        .from('users')
        .select('id, email, index_number')
        .or(`email.eq.${normalizedEmail},index_number.eq.${normalizedIndex}`)
        .maybeSingle();

      if (existingUser) {
        res.status(409).json({ success: false, message: 'User with this email or index number already exists' });
        return;
      }
    } else {
      for (const u of inMemoryDb.users.values()) {
        if (u.email === normalizedEmail || u.index_number === normalizedIndex) {
          res.status(409).json({ success: false, message: 'User with this email or index number already exists' });
          return;
        }
      }
    }

    // Hash password & generate 6-digit verification OTP
    const passwordHash = await bcrypt.hash(password, 10);
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationExpires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const newUser: UserRecord = {
      id: crypto.randomUUID(),
      index_number: normalizedIndex,
      name: name.trim(),
      email: normalizedEmail,
      password_hash: passwordHash,
      is_verified: false,
      verification_code: verificationCode,
      verification_expires: verificationExpires,
      role: 'STUDENT',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('users').insert({
        id: newUser.id,
        index_number: newUser.index_number,
        name: newUser.name,
        email: newUser.email,
        password_hash: newUser.password_hash,
        is_verified: false,
        verification_code: verificationCode,
        verification_expires: verificationExpires,
        role: newUser.role,
      });

      if (error) {
        console.error('❌ Supabase insert error:', error);
        res.status(500).json({ success: false, message: 'Database error creating account' });
        return;
      }
    } else {
      inMemoryDb.users.set(newUser.id, newUser);
    }

    // Send verification code via email service
    await emailService.sendVerificationOtp(newUser.email, newUser.name, verificationCode);

    res.status(201).json({
      success: true,
      message: 'Account created! Please check your email for the 6-digit verification code.',
      email: newUser.email,
      indexNumber: newUser.index_number,
    });
  } catch (err: any) {
    console.error('❌ Registration error:', err);
    res.status(500).json({ success: false, message: 'Internal server error during registration' });
  }
};

export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = verifyEmailSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ success: false, errors: parseResult.error.flatten().fieldErrors });
      return;
    }

    const { email, code } = parseResult.data;
    const normalizedEmail = email.toLowerCase().trim();

    let user: UserRecord | null = null;

    if (isSupabaseConfigured && supabase) {
      const { data } = await supabase.from('users').select('*').eq('email', normalizedEmail).maybeSingle();
      if (data) user = data as UserRecord;
    } else {
      for (const u of inMemoryDb.users.values()) {
        if (u.email === normalizedEmail) {
          user = u;
          break;
        }
      }
    }

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    if (user.is_verified) {
      res.status(200).json({ success: true, message: 'Email is already verified. Please sign in.' });
      return;
    }

    if (!user.verification_code || user.verification_code !== code.trim()) {
      res.status(400).json({ success: false, message: 'Invalid verification code' });
      return;
    }

    if (user.verification_expires && new Date(user.verification_expires) < new Date()) {
      res.status(400).json({ success: false, message: 'Verification code has expired. Please request a new one.' });
      return;
    }

    // Mark user as verified
    if (isSupabaseConfigured && supabase) {
      await supabase
        .from('users')
        .update({
          is_verified: true,
          verification_code: null,
          verification_expires: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
    } else {
      user.is_verified = true;
      user.verification_code = null;
      user.verification_expires = null;
      user.updated_at = new Date().toISOString();
      inMemoryDb.users.set(user.id, user);
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        index_number: user.index_number,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Email successfully verified!',
      token,
      user: {
        id: user.id,
        indexNumber: user.index_number,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err: any) {
    console.error('❌ Verify email error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const resendOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ success: false, message: 'Email is required' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    let user: UserRecord | null = null;

    if (isSupabaseConfigured && supabase) {
      const { data } = await supabase.from('users').select('*').eq('email', normalizedEmail).maybeSingle();
      if (data) user = data as UserRecord;
    } else {
      for (const u of inMemoryDb.users.values()) {
        if (u.email === normalizedEmail) {
          user = u;
          break;
        }
      }
    }

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    if (user.is_verified) {
      res.status(400).json({ success: false, message: 'Account is already verified' });
      return;
    }

    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    const newExpires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    if (isSupabaseConfigured && supabase) {
      await supabase
        .from('users')
        .update({
          verification_code: newCode,
          verification_expires: newExpires,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
    } else {
      user.verification_code = newCode;
      user.verification_expires = newExpires;
      inMemoryDb.users.set(user.id, user);
    }

    await emailService.sendVerificationOtp(user.email, user.name, newCode);

    res.json({ success: true, message: 'New verification code sent!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to resend verification code' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ success: false, message: 'Invalid login details' });
      return;
    }

    const { identifier, password } = parseResult.data;
    const cleanIdentifier = identifier.trim();

    let user: UserRecord | null = null;

    if (isSupabaseConfigured && supabase) {
      const { data } = await supabase
        .from('users')
        .select('*')
        .or(`email.eq.${cleanIdentifier.toLowerCase()},index_number.eq.${cleanIdentifier.toUpperCase()}`)
        .maybeSingle();

      if (data) user = data as UserRecord;
    } else {
      for (const u of inMemoryDb.users.values()) {
        if (
          u.email === cleanIdentifier.toLowerCase() ||
          u.index_number === cleanIdentifier.toUpperCase()
        ) {
          user = u;
          break;
        }
      }
    }

    if (!user) {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    if (!user.is_verified) {
      res.status(403).json({
        success: false,
        requiresVerification: true,
        email: user.email,
        message: 'Please verify your email before logging in.',
      });
      return;
    }

    const token = jwt.sign(
      {
        id: user.id,
        index_number: user.index_number,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        indexNumber: user.index_number,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('❌ Login error:', err);
    res.status(500).json({ success: false, message: 'Internal server error during login' });
  }
};

export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  res.json({ success: true, user: req.user });
};
