import { Component, OnInit } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup,Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { GetPersonalInfoRequest, PersonalInfoRequest } from 'src/app/models/personal-info-request.model';
import { AuthService } from 'src/app/services/auth.service';
import { resourcePermission } from 'src/app/models/api-resp.model';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';

@Component({
  selector: 'app-personal-information',
  templateUrl: './personal-information.component.html',
  styleUrls: ['./personal-information.component.css']
})
export class PersonalInformationComponent implements OnInit {
  submitted = false;
  personalInfoJson!: PersonalInfoRequest;
  getPersonalInfoRequest!: GetPersonalInfoRequest;
  userSessionDetails: userSessionDetails | null;
  frmValidate: FormGroup;
  private PersonalInfoSubscription?: Subscription;
  modalDisplayStyle = "none";
  userMessage = "";
  UserSession = {};
  isDisabledVariable = true;
  resourceNames: resourcePermission[] = [];
  constructor(private authService: AuthService, private fv: FormBuilder, private router: Router) {

    this.userSessionDetails = this.authService.getLoggedInUserDetails();
    this.frmValidate = fv.group(
        {
          firstName: ['', [Validators.required, Validators.minLength(3),Validators.pattern('^[a-zA-Z]+$')]],
          middleName: ['', [Validators.required, Validators.minLength(3),Validators.pattern('^[a-zA-Z]+$')]],
          lastName: ['', [Validators.required, Validators.minLength(3),Validators.pattern('^[a-zA-Z]+$')]],
          gender: ['', [Validators.required]],
          dateOfBirth: ['', [Validators.required]],
          address: ['', [Validators.required, Validators.minLength(3),Validators.pattern('')]],
          city: ['', [Validators.required]],
          pinCode: ['', [Validators.required, Validators.minLength(6),Validators.pattern('[0-9]*')]],
          mobileNumber: ['', [Validators.required, Validators.minLength(10),Validators.pattern('[0-9]*')]],
          email: ['', [Validators.required, Validators.email,Validators.email]]
        }
    );
    this.frmValidate.get('mobileNumber')?.disable();
    this.frmValidate.get('email')?.disable();
  }
  ngOnInit(): void {
    this.userSessionDetails = this.authService.getLoggedInUserDetails();
    this.getPersonalInfo();
    this.resourceNames = this.authService.getResourcesAccess();
  }
    get f(): { [key: string]: AbstractControl } {
    return this.frmValidate.controls;
    }
    getPersonalInfo() {
      this.PersonalInfoSubscription = this.authService.getPersonalInfo(this.userSessionDetails)
        .subscribe(
          (responce) => {
            this.getPersonalInfoRequest = responce;
            this.getPersonalInfoRequest=Object.assign(this.getPersonalInfoRequest.userInfo, this.getPersonalInfoRequest)
            console.log(this.getPersonalInfoRequest);
            this.frmValidate.patchValue({
              firstName: this.getPersonalInfoRequest.firstName,
              middleName: this.getPersonalInfoRequest.middleName,
              lastName: this.getPersonalInfoRequest.lastName,
              gender: this.getPersonalInfoRequest.gender,
              dateOfBirth: this.getPersonalInfoRequest.dateOfBirth,
              address: this.getPersonalInfoRequest.address,
              city: this.getPersonalInfoRequest.city,
              pinCode: this.getPersonalInfoRequest.pinCode,
              mobileNumber: this.getPersonalInfoRequest.mobileNumber,
               email: this.getPersonalInfoRequest.email,
    });
          }
          ,
          (error) => {
            console.log(error);
            this.modalDisplayStyle = "block";
            this.userMessage = "User already exists, Please login";
          })


  }

   onSavePersonalInfo() {
    this.submitted = true;
    if (this.frmValidate.valid) {
      // Form is valid, handle submission logic here
      // this.personalInfoJson = Object.assign(this.personalInfoJson, this.frmValidate.value);
      console.log('Form submitted:', this.personalInfoJson);
      this.PersonalInfoSubscription = this.authService.savePersonalInfo(this.personalInfoJson)
        .subscribe(
          (responce) => {
            console.log(responce);
            this.userMessage = "";
            this.modalDisplayStyle = "block";
          }
          ,
          (error) => {
            console.log(Object.assign(error));
            this.modalDisplayStyle = "block";
            this.userMessage = "User already exists, Please login";
          })
    }
     else {
      // Form is invalid, show error messages
      console.log('Form is invalid');
      console.log(JSON.stringify(this.frmValidate.value));
    }

  }
}
