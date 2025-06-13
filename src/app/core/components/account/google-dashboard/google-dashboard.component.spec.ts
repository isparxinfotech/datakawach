import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GoogleDashboardComponent } from './google-dashboard.component';

describe('GoogleDashboardComponent', () => {
  let component: GoogleDashboardComponent;
  let fixture: ComponentFixture<GoogleDashboardComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [GoogleDashboardComponent]
    });
    fixture = TestBed.createComponent(GoogleDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
