/** Who is asking. Built by the gateway from a verified token; never from request input. */
export interface Caller {
  userId: string;
  email: string;
  emailVerified: boolean;
}
