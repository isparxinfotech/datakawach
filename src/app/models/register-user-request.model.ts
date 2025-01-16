export interface RegisterUserRequest{
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
    password: string;
    corpoName: string;
    branch: string;
    landlineNumber: string;
    userType: number;

}
