import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { answerQuestion } from './chatService';
import { settingsRepo } from '../../db/queries/settings.queries';
import { conversationsRepo } from '../../db/queries/conversations.queries';
import { sendChatError } from '../../utils/errors';
import { visitorAuthService } from '../auth/visitorAuthService';
import { visitorUsersRepo } from '../../db/queries/visitorUsers.queries';
import { isWithinBusinessHours } from '../../utils/businessHours';
import { getSpeechProvider } from '../../providers/speech';
import { cleanTextForSpeech } from './promptAssembly';
import { isVerifiedAdminRequest, getVisitorUser } from './chatRequestAuth';
import { checkWidgetAvailability, checkLoginGateAndLimits } from './chatAccessControl';

const chatSchema = z.object({
  sessionId: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
  documentId: z.string().uuid().optional(),
  tag: z.string().min(1).max(50).optional(),
  bypassCache: z.boolean().optional(),
  userId: z.string().max(200).optional(),
  authToken: z.string().max(1000).optional(),
});

const visitorSignupSchema = z.object({
  name: z.string().max(100).default('Visitor'),
  email: z.string().email().max(200),
  password: z.string().min(4).max(100),
});

const visitorLoginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(100),
});

const voiceSchema = z.object({
  sessionId: z.string().min(1).max(200),
  documentId: z.string().uuid().optional(),
  tag: z.string().min(1).max(50).optional(),
});

const speakSchema = z.object({ text: z.string().min(1).max(2000) });

export async function handleVisitorSignup(req: Request, res: Response) {
  try {
    const widget = await settingsRepo.getWidget();
    if (widget.allowPublicSignup === false) {
      return res.status(403).json({
        error: 'Public sign-up is disabled. Please log in with your assigned credentials or contact an administrator.',
      });
    }
    const { name, email, password } = visitorSignupSchema.parse(req.body);
    const result = await visitorAuthService.signup(name, email, password);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to sign up' });
  }
}

export async function handleVisitorLogin(req: Request, res: Response) {
  try {
    const { email, password } = visitorLoginSchema.parse(req.body);
    const result = await visitorAuthService.login(email, password);
    res.json(result);
  } catch (err: any) {
    res.status(401).json({ error: err.message || 'Invalid email or password' });
  }
}

export async function handleVisitorMe(req: Request, res: Response) {
  try {
    const authHeader = req.header('authorization') || '';
    const token = (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '') || req.header('x-visitor-token') || '';
    if (!token) return res.json({ authenticated: false });
    const payload = visitorAuthService.verifyToken(token);
    if (!payload) return res.json({ authenticated: false });
    const user = await visitorUsersRepo.findById(payload.sub);
    if (!user) return res.json({ authenticated: false });
    res.json({ authenticated: true, user: { id: user.id, name: user.name, email: user.email, messageCount: user.messageCount } });
  } catch {
    res.json({ authenticated: false });
  }
}

export async function handleChat(req: Request, res: Response) {
  try {
    const { sessionId, message, documentId, tag, bypassCache, userId, authToken } = chatSchema.parse(req.body);
    const isAdmin = isVerifiedAdminRequest(req);

    if (!isAdmin) {
      const unavailable = await checkWidgetAvailability();
      if (unavailable) return res.status(unavailable.status).json(unavailable.body);

      const visitor = getVisitorUser(req, userId, authToken);
      const denied = await checkLoginGateAndLimits(sessionId, visitor);
      if (denied) return res.status(denied.status).json(denied.body);
    }

    const result = await answerQuestion(sessionId, message, { skipQuota: isAdmin, documentId, tag, bypassCache });
    if (!isAdmin) {
      delete result.compacted;
      const visitor = getVisitorUser(req, userId, authToken);
      if (visitor && visitor.email) {
        try {
          await visitorUsersRepo.incrementMessageCount(visitor.sub);
        } catch {
          /* ignore */
        }
      }
    }
    res.json(result);
  } catch (err: any) {
    sendChatError(res, err, 'chat');
  }
}

export async function handleVoice(req: Request, res: Response) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file uploaded.' });
    const { sessionId, documentId, tag } = voiceSchema.parse(req.body);
    const isAdmin = isVerifiedAdminRequest(req);

    const voice = await settingsRepo.getVoice();
    if (!voice.enabled) return res.status(503).json({ error: 'Voice conversation is not enabled.' });

    if (!isAdmin) {
      const unavailable = await checkWidgetAvailability();
      if (unavailable) return res.status(unavailable.status).json(unavailable.body);
    }

    const speechProvider = getSpeechProvider(voice.provider);
    if (!speechProvider.isConfigured()) {
      return res.status(503).json({ error: `The "${voice.provider}" voice provider has no API key configured on the server.` });
    }

    const t0 = Date.now();
    const { transcript } = await speechProvider.transcribe(req.file.buffer, req.file.originalname || 'recording', voice.languageCode);
    const t1 = Date.now();
    if (!transcript.trim()) return res.status(400).json({ error: "Couldn't understand that — please try speaking again." });

    const result = await answerQuestion(sessionId, transcript, { skipQuota: isAdmin, documentId, tag, channel: 'voice' });
    const t2 = Date.now();
    if (!isAdmin) delete result.compacted;

    let audio: { base64: string; format: string } | undefined;
    try {
      const speechText = cleanTextForSpeech(result.answer) || result.answer;
      const synthesized = await speechProvider.synthesize(speechText, voice.languageCode, voice.speaker);
      audio = { base64: synthesized.audioBase64, format: synthesized.audioFormat };
    } catch (err) {
      console.warn('[chat/voice] Text-to-speech failed — returning the text answer without audio:', (err as Error).message);
    }
    const t3 = Date.now();

    console.log(
      `[chat/voice] transcribe ${t1 - t0}ms, answer ${t2 - t1}ms (source: ${result.source}), synthesize ${t3 - t2}ms, total ${t3 - t0}ms`,
    );

    res.json({ transcript, answer: result.answer, source: result.source, conversationId: result.conversationId, audio });
  } catch (err: any) {
    sendChatError(res, err, 'chat/voice');
  }
}

export async function handleSpeak(req: Request, res: Response, next: NextFunction) {
  try {
    const { text } = speakSchema.parse(req.body);
    const isAdmin = isVerifiedAdminRequest(req);

    const voice = await settingsRepo.getVoice();

    if (!isAdmin) {
      const unavailable = await checkWidgetAvailability();
      if (unavailable) return res.status(unavailable.status).json(unavailable.body);
    }

    const speechProvider = getSpeechProvider(voice.provider);
    if (!speechProvider.isConfigured()) {
      return res.status(503).json({ error: `The "${voice.provider}" voice provider has no API key configured on the server.` });
    }

    const synthesized = await speechProvider.synthesize(text, voice.languageCode, voice.speaker);
    res.json({ audio: { base64: synthesized.audioBase64, format: synthesized.audioFormat } });
  } catch (err) {
    next(err);
  }
}

export async function handleHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = z.string().min(1).max(200).parse(req.query.sessionId);
    const conversationId = await conversationsRepo.findBySession(sessionId);
    if (!conversationId) return res.json({ conversationId: null, messages: [] });
    const messages = await conversationsRepo.listMessages(conversationId);
    res.json({ conversationId, messages });
  } catch (err) {
    next(err);
  }
}

export async function handleWidgetConfig(_req: Request, res: Response, next: NextFunction) {
  try {
    const [prompt, widget, businessHours, voice] = await Promise.all([
      settingsRepo.getPrompt(),
      settingsRepo.getWidget(),
      settingsRepo.getBusinessHours(),
      settingsRepo.getVoice(),
    ]);
    const openNow = widget.enabled && isWithinBusinessHours(businessHours);
    res.json({
      greeting: prompt.greeting,
      ...widget,
      enabled: openNow,
      unavailableMessage: !widget.enabled ? widget.unavailableMessage : businessHours.closedMessage,
      voiceEnabled: voice.enabled,
      requireLogin: Boolean(widget.requireLogin),
      allowPublicSignup: widget.allowPublicSignup !== false,
      loginPromptTitle: widget.loginPromptTitle || 'Sign up or Log in to continue',
      loginPromptMessage: widget.loginPromptMessage || 'Please create an account or sign in to ask questions and receive instant AI answers.',
      signupUrl: widget.signupUrl || '/signup',
      loginUrl: widget.loginUrl || '/login',
      freeQuestionsBeforeAuth: widget.freeQuestionsBeforeAuth ?? 0,
    });
  } catch (err) {
    next(err);
  }
}
