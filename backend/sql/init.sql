-- Local development schema based on the table and column names used by the
-- preserved Python application. Safe to rerun; it never drops existing data.
IF DB_ID(N'Fuel_Station') IS NULL
    CREATE DATABASE [Fuel_Station];
GO

USE [Fuel_Station];
GO

-- Filtered unique indexes require these session settings under sqlcmd.
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
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

IF OBJECT_ID(N'dbo.AuthPasswordResets', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AuthPasswordResets (
        [TokenHash] CHAR(64) NOT NULL PRIMARY KEY,
        [UserId] INT NOT NULL UNIQUE REFERENCES dbo.AuthUsers([Id]) ON DELETE CASCADE,
        [ExpiresAt] DATETIME2(0) NOT NULL,
        [CreatedAt] DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME()
    );
END;
GO

-- Upgrade existing fleet tables without replacing their data.
IF COL_LENGTH(N'dbo.Truck_Detail', N'Registration_Number') IS NULL
    ALTER TABLE dbo.Truck_Detail ADD [Registration_Number] NVARCHAR(40) NULL;
IF COL_LENGTH(N'dbo.Truck_Detail', N'Vehicle_Type') IS NULL
    ALTER TABLE dbo.Truck_Detail ADD [Vehicle_Type] NVARCHAR(40) NOT NULL CONSTRAINT DF_Truck_Detail_Vehicle_Type DEFAULT N'Truck' WITH VALUES;
IF COL_LENGTH(N'dbo.Truck_Detail', N'Fuel_Type') IS NULL
    ALTER TABLE dbo.Truck_Detail ADD [Fuel_Type] NVARCHAR(40) NOT NULL CONSTRAINT DF_Truck_Detail_Fuel_Type DEFAULT N'Diesel' WITH VALUES;
IF COL_LENGTH(N'dbo.Truck_Detail', N'Status') IS NULL
    ALTER TABLE dbo.Truck_Detail ADD [Status] NVARCHAR(16) NOT NULL CONSTRAINT DF_Truck_Detail_Status DEFAULT N'Active' WITH VALUES;
GO
IF OBJECT_ID(N'dbo.Drivers', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Drivers (
        [Id] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [Name] NVARCHAR(120) NOT NULL,
        [Phone] NVARCHAR(40) NOT NULL,
        [Email] NVARCHAR(254) NULL,
        [NationalId] NVARCHAR(40) NULL,
        [LicenseNumber] NVARCHAR(80) NOT NULL UNIQUE,
        [LicenseExpiryDate] DATE NULL,
        [AssignedVehicleName] NVARCHAR(120) NULL,
        [Address] NVARCHAR(500) NULL,
        [Status] NVARCHAR(16) NOT NULL CONSTRAINT DF_Drivers_Status DEFAULT N'Active',
        [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT DF_Drivers_CreatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_Drivers_Truck_Detail FOREIGN KEY ([AssignedVehicleName]) REFERENCES dbo.Truck_Detail([Name]) ON DELETE SET NULL
    );
    CREATE INDEX IX_Drivers_AssignedVehicleName ON dbo.Drivers([AssignedVehicleName]);
END;
GO
IF COL_LENGTH(N'dbo.Discounted_Fuel_Price', N'EffectiveDate') IS NULL
    ALTER TABLE dbo.Discounted_Fuel_Price ADD [EffectiveDate] DATE NULL;
IF COL_LENGTH(N'dbo.Discounted_Fuel_Price', N'SupplierName') IS NULL
    ALTER TABLE dbo.Discounted_Fuel_Price ADD [SupplierName] NVARCHAR(120) NULL;
GO
IF COL_LENGTH(N'dbo.Trip_Records', N'Current_Fuel_L') IS NULL
    ALTER TABLE dbo.Trip_Records ADD [Current_Fuel_L] DECIMAL(10, 2) NULL;
IF COL_LENGTH(N'dbo.Trip_Records', N'Fuel_Status') IS NULL
    ALTER TABLE dbo.Trip_Records ADD [Fuel_Status] NVARCHAR(80) NULL;
IF COL_LENGTH(N'dbo.Trip_Records', N'Driver_Id') IS NULL
    ALTER TABLE dbo.Trip_Records ADD [Driver_Id] INT NULL;
IF COL_LENGTH(N'dbo.Trip_Records', N'Reserve_Km') IS NULL
    ALTER TABLE dbo.Trip_Records ADD [Reserve_Km] DECIMAL(10, 2) NULL;
IF COL_LENGTH(N'dbo.Trip_Records', N'Route_Geometry') IS NULL
    ALTER TABLE dbo.Trip_Records ADD [Route_Geometry] NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.Trip_Records', N'Recommended_Stops') IS NULL
    ALTER TABLE dbo.Trip_Records ADD [Recommended_Stops] NVARCHAR(MAX) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Trip_Records_Drivers')
    ALTER TABLE dbo.Trip_Records ADD CONSTRAINT FK_Trip_Records_Drivers FOREIGN KEY ([Driver_Id]) REFERENCES dbo.Drivers([Id]) ON DELETE SET NULL;
GO
-- Existing accounts retain administrator access; future accounts require an explicit role.
IF COL_LENGTH(N'dbo.AuthUsers', N'Role') IS NULL
    ALTER TABLE dbo.AuthUsers ADD [Role] NVARCHAR(32) NULL;
GO
UPDATE dbo.AuthUsers SET [Role] = N'Admin' WHERE [Role] IS NULL;
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.AuthUsers') AND name = N'Role' AND is_nullable = 1)
    ALTER TABLE dbo.AuthUsers ALTER COLUMN [Role] NVARCHAR(32) NOT NULL;
GO
IF COL_LENGTH(N'dbo.AuthUsers', N'DriverId') IS NULL
    ALTER TABLE dbo.AuthUsers ADD [DriverId] INT NULL;
IF COL_LENGTH(N'dbo.AuthUsers', N'IsActive') IS NULL
    ALTER TABLE dbo.AuthUsers ADD [IsActive] BIT NOT NULL CONSTRAINT DF_AuthUsers_IsActive DEFAULT 1 WITH VALUES;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_AuthUsers_Drivers')
    ALTER TABLE dbo.AuthUsers ADD CONSTRAINT FK_AuthUsers_Drivers FOREIGN KEY ([DriverId]) REFERENCES dbo.Drivers([Id]) ON DELETE SET NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_AuthUsers_DriverId' AND object_id = OBJECT_ID(N'dbo.AuthUsers'))
    CREATE UNIQUE INDEX UX_AuthUsers_DriverId ON dbo.AuthUsers([DriverId]) WHERE [DriverId] IS NOT NULL;
GO

-- Station directory extends the existing route station table.
IF COL_LENGTH(N'dbo.LovesLocations', N'StationName') IS NULL ALTER TABLE dbo.LovesLocations ADD [StationName] NVARCHAR(150) NULL;
IF COL_LENGTH(N'dbo.LovesLocations', N'ContactNumber') IS NULL ALTER TABLE dbo.LovesLocations ADD [ContactNumber] NVARCHAR(40) NULL;
IF COL_LENGTH(N'dbo.LovesLocations', N'FuelTypes') IS NULL ALTER TABLE dbo.LovesLocations ADD [FuelTypes] NVARCHAR(120) NULL;
IF COL_LENGTH(N'dbo.LovesLocations', N'DieselPrice') IS NULL ALTER TABLE dbo.LovesLocations ADD [DieselPrice] DECIMAL(10, 4) NULL;
IF COL_LENGTH(N'dbo.LovesLocations', N'PetrolPrice') IS NULL ALTER TABLE dbo.LovesLocations ADD [PetrolPrice] DECIMAL(10, 4) NULL;
IF COL_LENGTH(N'dbo.LovesLocations', N'Status') IS NULL ALTER TABLE dbo.LovesLocations ADD [Status] NVARCHAR(16) NOT NULL CONSTRAINT DF_LovesLocations_Status DEFAULT N'Active' WITH VALUES;
GO
IF OBJECT_ID(N'dbo.FleetAlerts', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.FleetAlerts (
    [Id] INT IDENTITY(1,1) PRIMARY KEY, [Category] NVARCHAR(60) NOT NULL,
    [Priority] NVARCHAR(16) NOT NULL, [Title] NVARCHAR(200) NOT NULL,
    [Message] NVARCHAR(1000) NOT NULL, [EventKey] NVARCHAR(255) NOT NULL,
    [DriverId] INT NULL REFERENCES dbo.Drivers([Id]) ON DELETE SET NULL,
    [CreatedAt] DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    [ReadAt] DATETIME2(0) NULL, [ResolvedAt] DATETIME2(0) NULL
  );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_FleetAlerts_OpenEvent' AND object_id = OBJECT_ID(N'dbo.FleetAlerts'))
    CREATE UNIQUE INDEX UX_FleetAlerts_OpenEvent ON dbo.FleetAlerts([EventKey]) WHERE [ResolvedAt] IS NULL;
GO
IF OBJECT_ID(N'dbo.AlertPreferences', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.AlertPreferences (
    [UserId] INT NOT NULL PRIMARY KEY REFERENCES dbo.AuthUsers([Id]) ON DELETE CASCADE,
    [LicenseExpiryDays] INT NOT NULL DEFAULT 30,
    [NotifyInApp] BIT NOT NULL DEFAULT 1
  );
END;
GO
IF OBJECT_ID(N'dbo.AssistantMessages', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.AssistantMessages (
    [Id] BIGINT IDENTITY(1,1) PRIMARY KEY,
    [UserId] INT NOT NULL REFERENCES dbo.AuthUsers([Id]) ON DELETE CASCADE,
    [Role] NVARCHAR(16) NOT NULL,
    [Content] NVARCHAR(4000) NOT NULL,
    [CreatedAt] DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_AssistantMessages_UserId ON dbo.AssistantMessages([UserId], [Id]);
END;
GO
