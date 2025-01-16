export interface logiApiResponce{
    statusCode: string;
    message: string;
    jwtToken: string;
  username: string;
  resourcePermission: resourcePermission[],
  userType: number;
  roleid: number;
}
export class resourcePermission{
  pageid: number;
  accessLevel: string;
  active: boolean;
  displayName: string;
  pageName: string;

  public constructor(pageid: number, accessLevel: string,active: boolean,displayName: string,pageName: string) {
    this.pageid = pageid;
  this.accessLevel = accessLevel;
  this.active = active;
  this.displayName = displayName;
  this.pageName = pageName;
  }
}
