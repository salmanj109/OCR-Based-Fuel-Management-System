-- Local development schema based on the table and column names used by the
-- preserved Python application. Safe to rerun; it never drops existing data.
IF DB_ID(N'Fuel_Station') IS NULL
    CREATE DATABASE [Fuel_Station];
GO

USE [Fuel_Station];
GO

IF OBJECT_ID(N'dbo.Truck_Detail', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Truck_Detail (
        [Id] NVARCHAR(32) NOT NULL PRIMARY KEY,
        [Name] NVARCHAR(120) NOT NULL UNIQUE,
        [Fuel_Average_L] DECIMAL(10, 2) NOT NULL,
        [Truck_Fuel_Capacity] DECIMAL(10, 2) NOT NULL
    );
END;
GO

IF OBJECT_ID(N'dbo.LovesLocations', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.LovesLocations (
        [StoreNumber] NVARCHAR(50) NOT NULL PRIMARY KEY,
        [City] NVARCHAR(150) NOT NULL,
        [Address] NVARCHAR(255) NOT NULL,
        [Latitude] FLOAT NOT NULL,
        [Longitude] FLOAT NOT NULL
    );
END;
GO

IF OBJECT_ID(N'dbo.Discounted_Fuel_Price', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Discounted_Fuel_Price (
        [Name] NVARCHAR(255) NOT NULL PRIMARY KEY,
        [Your Price] DECIMAL(10, 4) NULL,
        [Savings] DECIMAL(10, 4) NULL
    );
END;
GO

IF OBJECT_ID(N'dbo.Trip_Records', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Trip_Records (
        [Id] INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
        [Starting_point] NVARCHAR(250) NOT NULL,
        [Destination_point] NVARCHAR(250) NOT NULL,
        [Total_Distance] DECIMAL(12, 2) NOT NULL,
        [Truck_Name] NVARCHAR(120) NOT NULL,
        [Truck_Average_L] DECIMAL(10, 2) NOT NULL,
        [Required_Time] TIME(0) NOT NULL,
        [Date] DATE NOT NULL
    );
END;
GO

IF OBJECT_ID(N'dbo.AuthUsers', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AuthUsers (
        [Id] INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
        [Name] NVARCHAR(120) NOT NULL,
        [Email] NVARCHAR(254) NOT NULL UNIQUE,
        [PasswordHash] NVARCHAR(255) NOT NULL,
        [CreatedAt] DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME()
    );
END;
GO

IF OBJECT_ID(N'dbo.AuthSessions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AuthSessions (
        [TokenHash] CHAR(64) NOT NULL PRIMARY KEY,
        [UserId] INT NOT NULL REFERENCES dbo.AuthUsers([Id]) ON DELETE CASCADE,
        [ExpiresAt] DATETIME2(0) NOT NULL,
        [CreatedAt] DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_AuthSessions_UserId ON dbo.AuthSessions([UserId]);
END;
GO
