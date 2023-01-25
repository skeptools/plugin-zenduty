import * as zenduty from '@skeptools/provider-zenduty';
import { BaseOrganization, BaseProps, OrganizationBaseProps, toKebabSlug, toTitleCase } from '@skeptools/skep-core';
import { Construct } from 'constructs';

export interface OrganizationProps extends BaseProps {
  // Teams that everyone in the org is added to.
  readonly orgTeams?: string[];
  // Map of integration name => Zenduty applicationId (see https://www.zenduty.com/api/account/applications/)
  // for all integrations for a standard team.
  readonly inboundItegrations: { [key: string]: string};
  // Map of integration name => Zenduty applicationId (see https://www.zenduty.com/api/account/applications/)
  // for all integrations for a standard team.
  readonly outboundItegrations?: { [key: string]: string};
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
    const { orgTeams = [] } = config;
    const cleanOrgTeams = orgTeams.filter(_ => _.trim() !== '');
    if (cleanOrgTeams.length === 0) cleanOrgTeams.push('everyone');

    this._orgTeams = cleanOrgTeams.map(teamName => {
      return new zenduty.teams.Teams(this, `${namespace}-${toKebabSlug(teamName)}-team`, {
        name: toTitleCase(teamName),
      });
    });
  }

  get _inboundIntegrations(): { [key: string]: string } {
    return this._props.inboundItegrations;
  }

  get _outboundIntegrations(): { [key: string]: string } {
    return this._props.outboundItegrations ?? {};
  }

  get orgTeamIds(): string[] {
    return this._orgTeams.map(_ => _.id);
  }
}
