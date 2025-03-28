import { Component, OnDestroy } from '@angular/core';
import { RegisterUserRequest } from 'src/app/models/register-user-request.model';
import { AuthService } from '../../../../services/auth.service';
import { AbstractControl,FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';

@Component({
  selector: 'app-register-user',
  templateUrl: './register-user.component.html',
  styleUrls: ['./register-user.component.css']
})
export class RegisterUserComponent implements OnDestroy{
  submitted = false;
  model: RegisterUserRequest;
  frmValidate: FormGroup;
  private registerUserSubscription?: Subscription;
  modalDisplayStyle = "none";
  userMessage = "";

  constructor(private authService:AuthService, private fv: FormBuilder, private router: Router) {
    this.model = {
      firstName: '',
      middleName: '',
      lastName: '',
      gender: '',
      dateOfBirth: null,
      address: '',
      city: '',
      pinCode: '',
      mobileNumber: '',
      email: '',
      password: '',
      corpoName: '',
      branch:'',
      landlineNumber: '',
      userType: 0,
      oneDriveUserId:'',
      onedriveUsername:'',
      onedrivePassword:'',
      onedriveTenantId:'',
      onedriveClientId:'',
      clientSecret:'',
      folderName:'',
      cloudProvider: '',
      ipAddress: ''
    };
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
          email: ['', [Validators.required, Validators.email,Validators.email]],
          password: ['', [Validators.required, Validators.minLength(4)]],
          confirmPwd: ['', [Validators.required, Validators.minLength(4)]],
          isTermsAndCondtionAccepted: ['', [Validators.required]],
          oneDriveUserId: ['', [Validators.maxLength(250)]],
          onedriveUsername: ['', [Validators.maxLength(250)]],
          onedrivePassword: ['', [Validators.maxLength(250)]],
          onedriveTenantId: ['', [Validators.maxLength(250)]],
          onedriveClientId: ['', [Validators.maxLength(250)]],
          clientSecret: ['', [Validators.maxLength(250)]]
        }
      );
  }


  get f(): { [key: string]: AbstractControl } {
    return this.frmValidate.controls;
  }

  onRegisterUser() {
    this.submitted = true;
    if (this.frmValidate.valid) {
      // Form is valid, handle submission logic here
      this.model = Object.assign(this.model, this.frmValidate.value);
      console.log('Form submitted:', this.model);
      this.model.userType = 5; //used for normal/end user
      this.model.corpoName = 'none';
      this.model.landlineNumber = 'none';
      this.model.branch = 'none';
      this.registerUserSubscription = this.authService.registerUser(this.model)
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
  onReset(): void {
    this.submitted = false;
    this.frmValidate.reset();
  }
  ngOnDestroy(): void {
    this.registerUserSubscription?.unsubscribe();
  }
  closeModel(): void{
    this.modalDisplayStyle = "none";
  }
  OpenModel(): void{
    this.modalDisplayStyle = "block";
  }
}
