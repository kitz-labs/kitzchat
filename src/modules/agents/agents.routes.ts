import { Router } from 'express';
import { postAgentChatHttp } from './agents.controller';

export function createAgentsRouter(): Router {
  const router = Router();
  router.post('/agent/chat', postAgentChatHttp);
  return router;
}
