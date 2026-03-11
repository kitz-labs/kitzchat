import type { Request, Response } from 'express';
import { runAgentChat } from './agents.service';

export async function postAgentChatHttp(req: Request, res: Response) {
  const { userId, email, name, agentCode, prompt } = req.body as {
    userId: number;
    email?: string;
    name: string;
    agentCode: string;
    prompt: string;
  };
  const result = await runAgentChat({ userId, email, name, agentCode, prompt });
  res.json(result);
}
