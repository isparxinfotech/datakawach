import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CoadminDashboardComponent } from './coadmin-dashboard.component';

describe('CoadminDashboardComponent', () => {
  let component: CoadminDashboardComponent;
  let fixture: ComponentFixture<CoadminDashboardComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [CoadminDashboardComponent]
    });
    fixture = TestBed.createComponent(CoadminDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
