import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UserAccountListComponent } from './user-account-list.component';

describe('CorporateAccountListComponent', () => {
  let component: UserAccountListComponent;
  let fixture: ComponentFixture<UserAccountListComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [UserAccountListComponent]
    });
    fixture = TestBed.createComponent(UserAccountListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
