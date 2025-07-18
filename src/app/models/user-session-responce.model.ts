// src/app/models/user-session-responce.model.ts
import { resourcePermission } from './api-resp.model';

export interface userSessionDetails {
  statusCode: string;
  message?: string;
  jwtToken: string;
  username: string;
  resourcePermission: resourcePermission[];
  userType: number;
  roleid: number;
  cloudProvider?: string;
retentionNeeded?: number | null;
qrCodeUrl?: string;
createdBy?: string;
}