import * as zenduty from '@skeptools/provider-zenduty';
import { BasePerson, BaseProps, PersonBaseProps } from '@skeptools/skep-core';
import { Construct } from 'constructs';
import { Organization } from './organization';


export type ZendutyRole = 'owner' | 'admin' | 'user'

const userRoleMap: Map<ZendutyRole, number> = new Map([
  ['owner', 2],
  ['admin', 2],
  ['user', 3],
]);

export const teamRoleMap: Map<ZendutyRole, number> = new Map([
  ['owner', 1],
  ['admin', 1],
  ['user', 2],
]);

export interface PersonProps extends BaseProps {
  readonly role: ZendutyRole;
  /**
   * This is a special-case account:
   * 1. Should only be one per org.
   * 2. It will need to be imported into Terraform state, since it will already exist.
   * 3. The role will be 1, but this is not exposed through the provider and cannot be edited.
   * 4. It will be flagged to prevent deletion.
   */
  readonly rootUser?: boolean;
}

export class Person<RoleType> extends BasePerson<PersonProps, RoleType> {
  _user?: zenduty.user.User;

  constructor(
    scope: Construct,
    namespace: string,
    org: Organization,
    config: PersonProps & PersonBaseProps<RoleType>,
  ) {
    super(scope, namespace, config);
    const { role: zendutyRole, rootUser = false } = config;

    const roleId: number | undefined = userRoleMap.get(zendutyRole);
    if (roleId) {
      this._user = new zenduty.user.User(this, `${this.slug}-${namespace}-user`, {
        email: this.emailAddress,
        firstName: this.firstName,
        lastName: this.lastName,
        role: rootUser ? undefined : roleId,
        team: org.orgTeamIds[0],
        lifecycle: {
          preventDestroy: rootUser,
        },
      });

      org.orgTeamIds.forEach((teamId, index) => {
        // Ignore first team in list because it is added on user creation above.
        if (index > 0) {
          new zenduty.member.Member(this, `${this.slug}-${namespace}-member`, {
            team: teamId,
            user: this._user!.id,
            role: teamRoleMap.get(zendutyRole),
          });
        }
      });
    }
  }

  get userId(): string | undefined {
    return this._user?.id;
  }
}
