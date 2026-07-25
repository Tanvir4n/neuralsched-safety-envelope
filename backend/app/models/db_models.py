"""SQLAlchemy models for NeuralSched."""
from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import (
    Column, DateTime, Enum, Float, ForeignKey,
    Integer, String, Text, func,
)
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class UserRole(str, enum.Enum):
    operator = "operator"
    admin = "admin"


class JobTag(str, enum.Enum):
    urgent = "urgent"
    flexible = "flexible"
    best_effort_green = "best_effort_green"


class JobStatus(str, enum.Enum):
    queued = "queued"
    running = "running"
    completed = "completed"
    deferred = "deferred"
    failed = "failed"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.operator, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    jobs = relationship("Job", back_populates="owner")


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    tag = Column(Enum(JobTag), nullable=False)
    status = Column(Enum(JobStatus), default=JobStatus.queued, nullable=False)
    gpu_requirement = Column(Integer, default=1)
    deadline_minutes = Column(Integer, nullable=True)
    assigned_node = Column(String(64), nullable=True)
    placement_score = Column(Float, nullable=True)
    carbon_cost = Column(Float, nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    owner = relationship("User", back_populates="jobs")
    alerts = relationship("Alert", back_populates="job")


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=True)
    node_id = Column(String(64), nullable=False)
    failure_probability = Column(Float, nullable=False)
    shap_values = Column(Text, nullable=True)   # JSON string
    resolved = Column(Integer, default=0)
    # Migration tracking: when the job is checkpointed + moved off this node.
    migrated = Column(Integer, default=0)        # 0 none | 1 auto | 2 manual
    migrated_to = Column(String(64), nullable=True)
    migrated_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    job = relationship("Job", back_populates="alerts")
