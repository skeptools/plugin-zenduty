import * as zenduty from '@skeptools/provider-zenduty';
import { BaseProps, BaseTeam, getArrayOfKeys, overRecord, TeamBaseProps, toKebabSlug, toTitleCase } from '@skeptools/skep-core';
import { Construct } from 'constructs';
import Timezone from 'timezone-enum';
import { Organization } from './organization';
import { Person, PersonProps, teamRoleMap } from './person';

// TODO: Unify these interfaces with PagerDuty
export type SecondaryType = 'following' | 'opposite' | 'preceding' | 'none'
const SecondsPerDay = 86400;

export interface RotationGroup {
  readonly timeZones?: Timezone[];
  readonly coverage?: {
    readonly startTime: string; // In HH:mm:ss format; implied to be in the time zone of the team.
    readonly durationHours: number;
  };
}

export interface TeamProps<PersonKeyType extends string> extends BaseProps {
  readonly rotation?: PersonKeyType[];
  readonly leadsOnCall?: PersonKeyType[]; // Leads who will be in support on zenduty
  readonly rotationDays?: number;
  readonly rotationGroups?: RotationGroup[];
  readonly escalationMinutes?: number;
  readonly secondaryType: SecondaryType;
  readonly startsAt: Date;
  readonly timeZone: Timezone;
}

export class Team<
  TeamTypeType extends string,
  PersonKeyType extends string,
  RoleType
> extends BaseTeam<
  PersonKeyType,
  RoleType,
  PersonProps,
  Person<RoleType>,
  TeamTypeType,
  TeamProps<PersonKeyType>
  > {
  _team: zenduty.teams.Teams;
  _integrations: { [key: string]: zenduty.integrations.Integrations };

  constructor(
    scope: Construct,
    namespace: string,
    org: Organization,
    people: Record<PersonKeyType, Person<RoleType>>,
    config: TeamProps<PersonKeyType> & TeamBaseProps<PersonKeyType, TeamTypeType>,
  ) {
    super(scope, namespace, people, config);
    const ManagedBy = org.managedBy;

    // Create a Zenduty Team and add all team members with a Zenduty account
    this._team = new zenduty.teams.Teams(this, `${this.slug}-${namespace}-team`, {
      name: config.name,
    });
    overRecord(this._allPeople, (user, key) => {
      if (user.userId) {
        new zenduty.member.Member(this, `${this.slug}-${user.slug}-${namespace}-member`, {
          team: this.teamId,
          user: user.userId,
          role: teamRoleMap.get(config.leads.includes(key) ? 'admin' : 'user'),
        });
      }
    });

    const allPeopleKeys = getArrayOfKeys(this._allPeople);
    const endsAt = new Date(3000, 0, 1); // Just put this far into the future
    const {
      escalationMinutes = 10,
      leadsOnCall = getArrayOfKeys(this._leads),
      rotation = allPeopleKeys,
      rotationDays = 7,
      secondaryType,
      startsAt,
      timeZone,
    } = config;
    const rotationGroups: RotationGroup[] = (config.rotationGroups || []).concat([{}]); // Adds a catch-all for times not covered by the rotation groups
    const schedules: zenduty.schedules.Schedules[] = [];

    rotation.forEach(name => {
      if (allPeopleKeys.indexOf(name) === -1) this.warn(`${name} is in the on-call rotation but not on the team (${this.name}).`);
    });
    allPeopleKeys.forEach(name => {
      if (rotation.indexOf(name) === -1) this.warn(`${name} is on the team (${this.name}) but not in the on-call rotation.`);
    });

    const rotationGroupsWithPeople = this.mergeGroupsWithPeople(rotationGroups, rotation);
    let primarySchedule = new zenduty.schedules.Schedules(this, `${this.slug}-${namespace}-primary-schedule`, {
      name: `${this.name} Primary Schedule`,
      description: ManagedBy,
      teamId: this.teamId,
      layers: this.zendutyScheduleLayers(rotationGroupsWithPeople, rotationDays, startsAt, endsAt),
      timeZone,
    });
    schedules.push(primarySchedule);

    if (secondaryType !== 'none') {
      let secondaryZendutyOffset = 1;
      switch (secondaryType) {
        case 'opposite':
          secondaryZendutyOffset = Math.floor(rotation.length / 2);
          break;
        case 'preceding':
          secondaryZendutyOffset = -1;
          break;
        default:
          // following, i.e. the default set above
          break;
      }
      const secondaryOffsetDays = -1 * rotationDays * (rotation.length - secondaryZendutyOffset);
      const secondaryStartsAt = startsAt;
      const secondaryEndsAt = endsAt;
      startsAt.setUTCDate(startsAt.getUTCDate() + secondaryOffsetDays);
      secondaryEndsAt.setUTCDate(secondaryEndsAt.getUTCDate() + secondaryOffsetDays);

      let secondarySchedule = new zenduty.schedules.Schedules(this, `${this.slug}-${namespace}-secondary-schedule`, {
        name: `${this.name} Secondary Schedule`,
        description: ManagedBy,
        teamId: this.teamId,
        layers: this.zendutyScheduleLayers(rotationGroupsWithPeople, rotationDays, secondaryStartsAt, secondaryEndsAt),
        timeZone,
      });
      schedules.push(secondarySchedule);
    }

    let tertiarySchedule = new zenduty.schedules.Schedules(this, `${this.slug}-${namespace}-tertiary-schedule`, {
      name: `${this.name} Leads Schedule`,
      description: ManagedBy,
      teamId: this.teamId,
      layers: this.zendutyScheduleLayers(this.mergeGroupsWithPeople(rotationGroups, leadsOnCall), rotationDays, startsAt, endsAt),
      timeZone,
    });
    schedules.push(tertiarySchedule);

    let escalationPolicy = new zenduty.esp.Esp(this, `${this.slug}-${namespace}-escalation-policy`, {
      name: `${this.name} Escalation Policy`,
      description: ManagedBy,
      teamId: this.teamId,
      moveToNext: true,
      rules: schedules.map((schedule, index) => {
        return {
          delay: index * escalationMinutes,
          targets: [{
            targetId: schedule.id,
            targetType: 1,
          }],
        };
      }),
    });

    let defaultService = new zenduty.services.Services(this, `${this.slug}-${namespace}-default-service`, {
      name: `${this.name}`,
      description: ManagedBy,
      teamId: this.teamId,
      escalationPolicy: escalationPolicy.id,
      collation: 0,
    });

    this._integrations = Object.entries(org._integrations).reduce((integrations, [name, applicationId]) => {
      integrations[`${toKebabSlug(name)}_high_priority`] = new zenduty.integrations.Integrations(this, `${this.slug}-${namespace}-${toKebabSlug(name)}-integration-high-priority`, {
        name: 'High Priority Alerts',
        serviceId: defaultService.id,
        teamId: this.teamId,
        application: applicationId,
        summary: `High Priority Alerts from ${toTitleCase(name)}`,
      });
      integrations[`${toKebabSlug(name)}_low_priority`] = new zenduty.integrations.Integrations(this, `${this.slug}-${namespace}-${toKebabSlug(name)}-integration-low-priority`, {
        name: 'Low Priority Alerts',
        serviceId: defaultService.id,
        teamId: this.teamId,
        application: applicationId,
        defaultUrgency: 0,
        summary: `Low Priority Alerts from ${toTitleCase(name)}`,
      });
      return integrations;
    }, Object.assign({}));

  }

  private mergeGroupsWithPeople(rotationGroups: RotationGroup[], rotation: PersonKeyType[]): Map<RotationGroup, string[]> {
    return rotation.reduce((grouped, name) => {
      const person = this._allPeople[name];
      if (person.userId) {
        const group = rotationGroups.find(g => g.timeZones === undefined || g.timeZones.length === 0 || g.timeZones.includes(person.timeZone));
        if (group) {
          grouped.set(group, (grouped.get(group) || []).concat([person.userId]));
        }
      }
      return grouped;
    }, new Map<RotationGroup, string[]>());

  }

  private zendutyScheduleLayers(
    rotationGroupsWithIds: Map<RotationGroup, string[]>,
    rotationLength: number,
    startsAt: Date,
    endsAt: Date,
  ): zenduty.schedules.SchedulesLayers[] {
    return [...rotationGroupsWithIds.keys()].map((group, index) => {
      return {
        name: `Schedule Layer ${index + 1}`,
        shiftLength: rotationLength * SecondsPerDay,
        rotationStartTime: startsAt.toISOString(),
        rotationEndTime: endsAt.toISOString(),
        restrictionType: 1, //1 for day, 2 for week ,0 for default
        restrictions: group.coverage ? [{
          startTimeOfDay: group.coverage.startTime,
          duration: group.coverage.durationHours * 3600,
          startDayOfWeek: 7,
        }] : undefined,
        users: rotationGroupsWithIds.get(group) || [],
      };
    }).filter(layer => layer.users.length > 0);
  }

  get teamId(): string {
    return this._team.id;
  }

  get integrationUrls(): { [key: string]: string } {
    return Object.entries(this._integrations).reduce((mapped, [name, integration]) => {
      mapped[name] = integration.webhookUrl;
      return mapped;
    }, Object.assign({}));
  }
}
