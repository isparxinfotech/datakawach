import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CorporateAccountListComponent } from './corporate-account-list.component';

describe('CorporateAccountListComponent', () => {
  let component: CorporateAccountListComponent;
  let fixture: ComponentFixture<CorporateAccountListComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [CorporateAccountListComponent]
    });
    fixture = TestBed.createComponent(CorporateAccountListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
