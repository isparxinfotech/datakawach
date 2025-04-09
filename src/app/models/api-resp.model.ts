export interface LoginUserRequest {
  username: string;
  password: string;
}

export interface RegisterUserRequest {
  username: string;
  email: string;
  password: string;
  mobileNumber: string;
  // Add other registration fields as needed
}

export interface userSessionDetails {
  statusCode: string;
  message?: string;
  jwtToken: string;
  username: string;
  resourcePermission: resourcePermission[];
  userType: number;
  roleid: number;
  cloudProvider?: string;
}

export class resourcePermission {
  constructor(
    public pageid: number,
    public accessLevel: string,
    public active: boolean,
    public displayName: string,
    public pageName: string
  ) {}
}

// For personal info requests
export interface PersonalInfoRequest {
  userId: number;
  fullName: string;
  email: string;
  // Add other personal info fields as needed
}

export interface GetPersonalInfoRequest {
  userId: number;
  // Add other response fields as needed
}