import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PhotographerDashboardComponent } from './photographer-dashboard.component';

describe('PhotographerDashboardComponent', () => {
  let component: PhotographerDashboardComponent;
  let fixture: ComponentFixture<PhotographerDashboardComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [PhotographerDashboardComponent]
    });
    fixture = TestBed.createComponent(PhotographerDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
