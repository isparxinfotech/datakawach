export interface PersonalInfoRequest {
  userid: string;
  firstName: string;
  middleName: string;
  lastName: string;
  gender: string;
  dateOfBirth: Date | null;
  address: string;
  city: string;
  pinCode: string;
  mobileNumber: string;
  email: string;

}

export interface GetPersonalInfoRequest {
  userid: string;
  firstName: string;
  middleName: string;
  lastName: string;
  gender: string;
  dateOfBirth: Date;
  strDateOfBirth: string;
  address: string;
  city: string;
  pinCode: string;
  mobileNumber: string;
  email: string;


  userInfo: PersonalInfoRequest[];
}
