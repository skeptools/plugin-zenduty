import * as zenduty from '@skeptools/provider-zenduty';
import { BaseOrganization, BaseProps, OrganizationBaseProps, toKebabSlug } from '@skeptools/skep-core';
import { Construct } from 'constructs';

export interface OrganizationProps extends BaseProps {
  // Teams that everyone in the org is added to.
  readonly orgTeams?: string[];
  // Map of integration name => Zenduty applicationId (see https://www.zenduty.com/api/account/applications/)
  // for all integrations for a standard team.
  readonly integrations: { [key: string]: string};
  // TODO: teams for subGroups.
}

export class Organization extends BaseOrganization<OrganizationProps> {
  _orgTeams: zenduty.teams.Teams[];

  constructor(
    scope: Construct,
    namespace: string,
    config: OrganizationProps & OrganizationBaseProps,
  ) {
    super(scope, namespace, config);

    this._orgTeams = (config.orgTeams ?? []).map(teamName => {
      return new zenduty.teams.Teams(this, `${namespace}-${toKebabSlug(teamName)}-team`, {
        name: teamName,
      });
    });
  }

  get _integrations(): { [key: string]: string } {
    return this._props.integrations;
  }

  get orgTeamIds(): string[] {
    return this._orgTeams.map(_ => _.id);
  }
}
