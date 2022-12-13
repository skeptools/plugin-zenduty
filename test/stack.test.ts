import { OrganizationProps, PersonProps, SkepStack, TeamProps } from '@skeptools/skep-core';
import { App } from 'cdktf';
import Timezone from 'timezone-enum';
import { Factory } from '../src';

type TeamType = 'team' | 'guild';
type RoleType = 'engineering' | 'product';

const fooBar = {
  firstName: 'Foo',
  lastName: 'Bar',
  emailAddress: 'foo.bar@example.com',
  role: 'engineering',
  integrations: {
    zenduty: {
      role: 'owner',
    },
  },
} as PersonProps<Integrations, RoleType>;

const balBaz = {
  firstName: 'Bal',
  lastName: 'Baz',
  emailAddress: 'bal.baz@example.com',
  role: 'product',
  integrations: {
    zenduty: {
    },
  },
} as PersonProps<Integrations, RoleType>;

const people = { fooBar, balBaz };

const fooTeam = {
  name: 'Foo',
  leads: ['fooBar'],
  members: ['balBaz'],
  integrations: {
    zenduty: {
      secondaryType: 'following',
      startsAt: new Date(2020, 1, 1),
      timeZone: Timezone['America/New_York'],
    },
  },
} as TeamProps<Integrations, PeopleKeys, TeamType>;

const barGuild = {
  name: 'Bar',
  leads: ['fooBar'],
  members: ['balBaz'],
  integrations: {
  },
  type: 'guild',
} as TeamProps<Integrations, PeopleKeys, TeamType>;

const teams = { fooTeam, barGuild };

const organization: OrganizationProps<Integrations> = {
  name: 'Test',
  integrations: {
    zenduty: {
      orgTeams: ['all'],
      integrations: {
        cloudwatch: '1ef0e211-82fb-454a-96c4-20bd26ebdcab',
      },
    },
  },
};

type PeopleKeys = Extract<keyof typeof people, string>;
type TeamKeys = Extract<keyof typeof teams, string>;
interface Integrations {
  zenduty: Factory<PeopleKeys, TeamType, RoleType>;
}

export class TestSkepStack extends SkepStack<Integrations, PeopleKeys, TeamKeys, TeamType, RoleType> {
  get defaultConfig() {
    return {
      team: {
        type: 'team' as TeamType,
      },
    };
  }

  load(
    orgConfig: OrganizationProps<Integrations>,
    peopleConfig: Record<PeopleKeys, PersonProps<Integrations, RoleType>>,
    teamConfig: Record<TeamKeys, TeamProps<Integrations, PeopleKeys, TeamType>>,
  ): Integrations {
    const zenduty = new Factory<PeopleKeys, TeamType, RoleType>(
      this,
      'zenduty',
      this.getOrganizationConfig(orgConfig, 'zenduty'),
      this.getPersonConfig(peopleConfig, 'zenduty'),
      this.getTeamConfig(teamConfig, 'zenduty'),
    );
    zenduty.load();
    return { zenduty };
  }
}

test('SkepStack', () => {
  const app = new App();
  new TestSkepStack(app, 'test-skep-stack', organization, people, teams);
  app.synth();
});