// Centralized table name configuration. Removes the need to keep table names in .env
// Access via ConfigService.get<string>('TABLES.XYZ_TABLE')

export default () => ({
  TABLES: {
    USER_PROFILES_TABLE: 'UserProfiles',
    BOARDS_TABLE: 'Boards',
    BOARD_MEMBERSHIPS_TABLE: 'BoardMemberships',
    BOARD_JOIN_REQUESTS_TABLE: 'BoardJoinRequests',
    AVAILABLE_SERVICES_TABLE: 'AvailableServices',
    BOARD_SERVICE_SETTINGS_TABLE: 'BoardServiceSettings',
    BOARD_SERVICE_PERMISSIONS_TABLE: 'BoardServicePermissions',
  },
});


