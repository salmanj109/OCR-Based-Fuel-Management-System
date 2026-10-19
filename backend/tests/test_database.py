"""Offline checks for SQL Server configuration and the read-only probe."""

import os
import unittest
from unittest.mock import MagicMock, patch

from sqlalchemy.dialects.mssql.pyodbc import MSDialect_pyodbc

from app.core.config import DatabaseConfigurationError, DatabaseSettings, get_database_settings
from app.core.database import build_database_url, check_database_connection


class DatabaseTests(unittest.TestCase):
    def test_missing_configuration_is_rejected(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(DatabaseConfigurationError):
                get_database_settings()

    def test_url_preserves_special_characters_in_credentials(self) -> None:
        settings = DatabaseSettings(
            host="localhost",
            port=1433,
            name="Fuel_Station",
            user="test_user",
            password="p@ss:word/with#symbols",
            driver="ODBC Driver 18 for SQL Server",
            encrypt="yes",
            trust_server_certificate="no",
            connect_timeout=5,
        )
        url = build_database_url(settings)
        self.assertEqual(url.password, settings.password)
        self.assertEqual(url.query["driver"], settings.driver)
        self.assertNotIn(settings.password, str(url))

    def test_windows_auth_uses_trusted_connection(self) -> None:
        settings = DatabaseSettings(
            host=r".\SQLEXPRESS", port=None, name="Fuel_Station", user="", password="",
            driver="ODBC Driver 17 for SQL Server", encrypt="no",
            trust_server_certificate="yes", connect_timeout=5, auth="windows",
        )
        connection_string = MSDialect_pyodbc().create_connect_args(build_database_url(settings))[0][0]
        self.assertIn("Trusted_Connection=Yes", connection_string)
        self.assertNotIn("UID=", connection_string)
        self.assertNotIn("PWD=", connection_string)
        self.assertIn(r"Server=.\SQLEXPRESS", connection_string)
        self.assertNotIn(",1433", connection_string)

    @patch("app.core.database.get_engine")
    def test_connection_probe_only_selects_one(self, mocked_engine: MagicMock) -> None:
        connection = mocked_engine.return_value.connect.return_value.__enter__.return_value
        connection.execute.return_value.scalar_one.return_value = 1

        self.assertTrue(check_database_connection())
        self.assertEqual(str(connection.execute.call_args.args[0]), "SELECT 1")


if __name__ == "__main__":
    unittest.main()
