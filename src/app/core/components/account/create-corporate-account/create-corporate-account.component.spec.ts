import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateCorporateAccountComponent } from './create-corporate-account.component';

describe('CreateCorporateAccountComponent', () => {
  let component: CreateCorporateAccountComponent;
  let fixture: ComponentFixture<CreateCorporateAccountComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [CreateCorporateAccountComponent]
    });
    fixture = TestBed.createComponent(CreateCorporateAccountComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
