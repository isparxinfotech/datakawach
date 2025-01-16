import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HealthScoreComponent } from './health-score.component';

describe('HealthScoreComponent', () => {
  let component: HealthScoreComponent;
  let fixture: ComponentFixture<HealthScoreComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [HealthScoreComponent]
    });
    fixture = TestBed.createComponent(HealthScoreComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
