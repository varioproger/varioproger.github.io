---
title: Releases and maintenance
product: ansible
source_url: https://docs.ansible.com/ansible/latest/reference_appendices/release_and_maintenance.html
source_path: ansible/ansible-documentation:docs/docsite/rst/reference_appendices/release_and_maintenance.rst
---

# Releases and maintenance

This section describes release cycles, rules, and maintenance schedules for both Ansible community projects: the Ansible community package and `ansible-core`. The two projects have different versioning systems, maintenance structures, contents, and workflows.

| Ansible community package                            | ansible-core                                             |
|------------------------------------------------------|----------------------------------------------------------|
| Uses new versioning (2.10, then 3.0.0)               | Continues "classic Ansible" versioning (2.11, then 2.12) |
| Follows semantic versioning rules                    | Does not use semantic versioning                         |
| Maintains only one version at a time                 | Maintains latest version plus two older versions         |
| Includes language, runtime, and selected Collections | Includes language, runtime, and builtin plugins          |
| Developed and maintained in Collection repositories  | Developed and maintained in ansible/ansible repository   |

Many community users install the Ansible community package. The Ansible community package offers the functionality that existed in Ansible 2.9, with more than 85 Collections containing thousands of modules and plugins. The `ansible-core` option is primarily for developers and users who want to install only the collections they need.

## Release cycle overview

The two community releases are related - the release cycle follows this pattern:

1.  Release of a new ansible-core major version, for example, ansible-core 2.11
    - New release of ansible-core and two prior versions are now maintained (in this case, ansible-base 2.10, Ansible 2.9)
    - Work on new features for ansible-core continues in the `devel` branch
2.  Collection freeze (no new Collections or new versions of existing Collections) on the Ansible community package
3.  Release candidate for Ansible community package, testing, additional release candidates as necessary
4.  Release of a new Ansible community package major version based on the new ansible-core, for example, Ansible 4.0.0 based on ansible-core 2.11
    - Newest release of the Ansible community package is the only version now maintained
    - Work on new features continues in Collections
    - Individual Collections can make multiple minor and major releases
5.  Minor releases of three maintained ansible-core versions every four weeks (2.11.1)
6.  Minor releases of the single maintained Ansible community package version every four weeks (4.1.0)
7.  Feature freeze on ansible-core
8.  Release candidate for ansible-core, testing, additional release candidates as necessary
9.  Release of the next ansible-core major version, cycle begins again

### Ansible community package release cycle

The Ansible community team typically releases two major versions of the community package per year, on a flexible release cycle that trails the release of `ansible-core`. This cycle can be extended to allow for larger changes to be properly implemented and tested before a new release is made available. See ansible_roadmaps for upcoming release details. Between major versions, we release a new minor version of the Ansible community package every four weeks. Minor releases include new backwards-compatible features, modules and plugins, as well as bug fixes.

Starting with version 2.10, the Ansible community team guarantees maintenance for only one major community package release at a time. For example, when Ansible 4.0.0 gets released, the team will stop making new 3.x releases. Community members may maintain older versions if desired.


> [!NOTE]
>
> Each Ansible EOL version may issue one final maintenance release at or shortly after the first release of the next version. When this happens, the final maintenance release is EOL at the date it releases.


> [!NOTE]
>
> Older, unmaintained versions of the Ansible community package might contain unfixed security vulnerabilities (*CVEs*). If you are using a release of the Ansible community package that is no longer maintained, we strongly encourage you to upgrade as soon as possible to benefit from the latest features and security fixes.


Each major release of the Ansible community package accepts the latest released version of each included Collection and the latest released version of ansible-core. For specific schedules and deadlines, see the ansible_roadmaps for each version. Major releases of the Ansible community package can contain breaking changes in the modules and other plugins within the included Collections and in core features.

The Ansible community package follows semantic versioning rules. Minor releases of the Ansible community package accept only backwards-compatible changes in included Collections, that is, not Collections major releases. Collections must also use semantic versioning, so the Collection version numbers reflect this rule. For example, if Ansible 3.0.0 releases with community.general 2.0.0, then all minor releases of Ansible 3.x (such as Ansible 3.1.0 or Ansible 3.5.0) must include a 2.x release of community.general (such as 2.8.0 or 2.9.5) and not 3.x.x or later major releases.

Work in Collections is tracked within the individual Collection repositories.

You can refer to the Ansible package porting guides for tips on updating your playbooks to run on newer versions of Ansible. For Ansible 2.10 and later releases, you can install the Ansible package with `pip`. See [Installing Ansible](../../installation_guide/intro_installation.md) for details. You can download older Ansible releases from <https://releases.ansible.com/ansible/>.

### Ansible community changelogs

This table links to the changelogs for each major Ansible release. These changelogs contain the dates and significant changes in each minor release.

| Ansible Community Package Release                                                                             | Status                      | Core version dependency |
|---------------------------------------------------------------------------------------------------------------|-----------------------------|-------------------------|
| 14.0.0                                                                                                        | In development (unreleased) | 2.21                    |
| [13.x Changelogs](https://github.com/ansible-community/ansible-build-data/blob/main/13/CHANGELOG-v13.md)      | Current- Latest             | 2.20                    |
| [12.x Changelogs](https://github.com/ansible-community/ansible-build-data/blob/main/12/CHANGELOG-v12.md)      | EOL in Dec 2025             | 2.19                    |
| [11.x Changelogs](https://github.com/ansible-community/ansible-build-data/blob/main/11/CHANGELOG-v11.md)      | EOL in Dec 2025             | 2.18                    |
| [10.x Changelogs](https://github.com/ansible-community/ansible-build-data/blob/main/10/CHANGELOG-v10.md)      | Unmaintained (end of life)  | 2.17                    |
| [9.x Changelogs](https://github.com/ansible-community/ansible-build-data/blob/main/9/CHANGELOG-v9.rst)        | Unmaintained (end of life)  | 2.16                    |
| [8.x Changelogs](https://github.com/ansible-community/ansible-build-data/blob/main/8/CHANGELOG-v8.rst)        | Unmaintained (end of life)  | 2.15                    |
| [7.x Changelogs](https://github.com/ansible-community/ansible-build-data/blob/main/7/CHANGELOG-v7.rst)        | Unmaintained (end of life)  | 2.14                    |
| [6.x Changelogs](https://github.com/ansible-community/ansible-build-data/blob/main/6/CHANGELOG-v6.rst)        | Unmaintained (end of life)  | 2.13                    |
| [5.x Changelogs](https://github.com/ansible-community/ansible-build-data/blob/main/5/CHANGELOG-v5.rst)        | Unmaintained (end of life)  | 2.12                    |
| [4.x Changelogs](https://github.com/ansible-community/ansible-build-data/blob/main/4/CHANGELOG-v4.rst)        | Unmaintained (end of life)  | 2.11                    |
| [3.x Changelogs](https://github.com/ansible-community/ansible-build-data/blob/main/3/CHANGELOG-v3.rst)        | Unmaintained (end of life)  | 2.10                    |
| [2.10 Changelogs](https://github.com/ansible-community/ansible-build-data/blob/main/2.10/CHANGELOG-v2.10.rst) | Unmaintained (end of life)  | 2.10                    |

### ansible-core release cycle

`ansible-core` is developed and released on a flexible release cycle. We can extend this cycle to properly implement and test larger changes before a new release is made available. See ansible_core_roadmaps for upcoming release details.

`ansible-core` has a graduated maintenance structure that extends to three major releases.
For more information, read about the [Releases and maintenance](release_and_maintenance.md) or
see the chart in [Releases and maintenance](release_and_maintenance.md) for the degrees to which current releases are maintained.


> [!NOTE]
>
> Older, unmaintained versions of `ansible-core` can contain unfixed security vulnerabilities (*CVEs*). If you are using a release of `ansible-core` that is no longer maintained, we strongly encourage you to upgrade as soon as possible to benefit from the latest features and security fixes. `ansible-core` maintenance continues for 3 releases. Thus the latest release receives security and general bug fixes when it is first released, security and critical bug fixes when the next `ansible-core` version is released, and **only** security fixes once the follow on to that version is released.


You can refer to the core_porting_guides for tips on updating your playbooks to run on newer versions of `ansible-core`.

You can install `ansible-core` with `pip`. See [Installing Ansible](../../installation_guide/intro_installation.md) for details.

### `ansible-core` control node Python support

Starting with `ansible-core` version 2.12, each release includes control node support for the three most recently released Python versions.

### `ansible-core` target node Python support

Starting with `ansible-core` version 2.16, each release includes target node support for:

- The 6 most recently released Python versions.
- The 7 most recently released Python versions every 6th `ansible-core` release (2.16, 2.22, etc.)

Support for Python 2.7 is included in `ansible-core` version 2.16 and earlier.

### `ansible-core` target node Windows support

`ansible-core` supports Windows target nodes based on the Windows lifecycle policy. Support ends for a target Windows version when that version reaches the extended end date. For example Windows Server 2012 and 2012 R2 extended end date was for October 10th 2023 while Windows Server 2016 is January 12th 2027. Windows support does not align with the 3 year Extended Security Updates (`ESU`) support from Microsoft which is a paid support option for products that are past the normal end of support date from Microsoft.

### `ansible-core` target node PowerShell support

`ansible-core` on Windows supports Windows PowerShell 5.1 that is included with Windows out of the box. Starting with `ansible-core` version 2.21, each release also includes target node support for the latest LTS release of PowerShell 7.x.

PowerShell 7 follows a two-year LTS release cycle, with each LTS version supported for three years. Most Ansible releases align with a single PowerShell LTS version. However, every 5th Ansible release coincides with a PowerShell LTS transition period and supports **both** the outgoing and incoming LTS versions:

- The **outgoing LTS** version reaches end-of-life during the Ansible release's maintenance window
- The **incoming LTS** version is in preview when Ansible releases and becomes GA around the release or a few months later

This overlapping support allows users to plan their transition to the new PowerShell LTS while the outgoing version is still supported by Microsoft.

<table>
<colgroup>
<col style="width: 15%" />
<col style="width: 20%" />
<col style="width: 20%" />
<col style="width: 45%" />
</colgroup>
<thead>
<tr class="header">
<th>Ansible Core</th>
<th>PowerShell Version</th>
<th>PowerShell Lifecycle</th>
<th>Notes</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td>2.21</td>
<td>7.6 LTS</td>
<td>Mar 2026 - Nov 2028</td>
<td>Standard single-LTS support</td>
</tr>
<tr class="even">
<td>2.22</td>
<td>7.6 LTS</td>
<td>Mar 2026 - Nov 2028</td>
<td>Standard single-LTS support</td>
</tr>
<tr class="odd">
<td>2.23</td>
<td>7.6 LTS</td>
<td>Mar 2026 - Nov 2028</td>
<td>Standard single-LTS support</td>
</tr>
<tr class="even">
<td>2.24</td>
<td>7.6 LTS, 7.8 LTS</td>
<td>7.6: Mar 2026 - Nov 2028<br />
7.8: Nov 2027 - Nov 2029</td>
<td><strong>Overlapping LTS support</strong><br />
7.6 EOL during maintenance window<br />
7.8 preview at release; GA ~Nov/Dec 2028</td>
</tr>
<tr class="odd">
<td>2.25</td>
<td>7.8 LTS</td>
<td>Nov 2027 - Nov 2029</td>
<td>Standard single-LTS support</td>
</tr>
</tbody>
</table>

The next multi LTS release after this will be 2.28, which will support PowerShell 7.8 and 7.10.


> [!NOTE]
>
> Dates shown are based on the current release schedules for Ansible and PowerShell and may vary. PowerShell 7.8 is expected to be in preview when Ansible 2.24 releases in November 2027, with general availability around November to March.


### `ansible-core` support matrix

This table links to the changelogs for each major `ansible-core` release. These changelogs contain the dates and significant changes in each minor release.
Dates listed indicate the start date of the maintenance cycle.

<table>
<thead>
<tr class="header">
<th>Version</th>
<th>Support</th>
<th>End Of Life</th>
<th>Control Node Python</th>
<th>Target Python / PowerShell</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td>2.22</td>
<td>GA: Nov 2026<br />
Critical: May 2027<br />
Security: Nov 2027</td>
<td>May 2028</td>
<td>Python 3.13 - 3.15</td>
<td>Python 3.9 - 3.15<br />
PowerShell 5.1 - 7</td>
</tr>
<tr class="even">
<td><a href="https://github.com/ansible/ansible/blob/stable-2.21/changelogs/CHANGELOG-v2.21.rst">2.21</a></td>
<td>GA: May 2026<br />
Critical: Nov 2026<br />
Security: May 2027</td>
<td>Nov 2027</td>
<td>Python 3.12 - 3.14</td>
<td>Python 3.9 - 3.14<br />
PowerShell 5.1 - 7</td>
</tr>
<tr class="odd">
<td><a href="https://github.com/ansible/ansible/blob/stable-2.20/changelogs/CHANGELOG-v2.20.rst">2.20</a></td>
<td>GA: 03 Nov 2025<br />
Critical: 18 May 2026<br />
Security: 02 Nov 2026</td>
<td>May 2027</td>
<td>Python 3.12 - 3.14</td>
<td>Python 3.9 - 3.14<br />
PowerShell 5.1</td>
</tr>
<tr class="even">
<td><a href="https://github.com/ansible/ansible/blob/stable-2.19/changelogs/CHANGELOG-v2.19.rst">2.19</a></td>
<td>GA: 21 July 2025<br />
Critical: 03 Nov 2025<br />
Security: 18 May 2026</td>
<td>Nov 2026</td>
<td>Python 3.11 - 3.13</td>
<td>Python 3.8 - 3.13<br />
PowerShell 5.1</td>
</tr>
<tr class="odd">
<td><a href="https://github.com/ansible/ansible/blob/stable-2.18/changelogs/CHANGELOG-v2.18.rst">2.18</a></td>
<td>GA: 04 Nov 2024<br />
Critical: 19 May 2025<br />
Security: 03 Nov 2025</td>
<td>May 2026</td>
<td>Python 3.11 - 3.13</td>
<td>Python 3.8 - 3.13<br />
PowerShell 5.1</td>
</tr>
<tr class="even">
<td><a href="https://github.com/ansible/ansible/blob/stable-2.17/changelogs/CHANGELOG-v2.17.rst">2.17</a></td>
<td>GA: 20 May 2024<br />
Critical: 04 Nov 2024<br />
Security: 19 May 2025</td>
<td><strong>EOL</strong><br />
Nov 2025</td>
<td>Python 3.10 - 3.12</td>
<td>Python 3.7 - 3.12<br />
PowerShell 5.1</td>
</tr>
<tr class="odd">
<td><a href="https://github.com/ansible/ansible/blob/stable-2.16/changelogs/CHANGELOG-v2.16.rst">2.16</a></td>
<td>GA: 06 Nov 2023<br />
Critical: 20 May 2024<br />
Security: Nov 2024</td>
<td><strong>EOL</strong><br />
July 2025</td>
<td>Python 3.10 - 3.12</td>
<td>Python 2.7<br />
Python 3.6 - 3.12<br />
Powershell 5.1</td>
</tr>
<tr class="even">
<td><a href="https://github.com/ansible/ansible/blob/stable-2.15/changelogs/CHANGELOG-v2.15.rst">2.15</a></td>
<td>GA: 22 May 2023<br />
Critical: 06 Nov 2023<br />
Security: 20 May 2024</td>
<td><strong>EOL</strong><br />
Nov 2024</td>
<td>Python 3.9 - 3.11</td>
<td>Python 2.7<br />
Python 3.5 - 3.11<br />
PowerShell 3 - 5.1</td>
</tr>
<tr class="odd">
<td><a href="https://github.com/ansible/ansible/blob/stable-2.14/changelogs/CHANGELOG-v2.14.rst">2.14</a></td>
<td>GA: 07 Nov 2022<br />
Critical: 22 May 2023<br />
Security: 06 Nov 2023</td>
<td><strong>EOL</strong><br />
20 May 2024</td>
<td>Python 3.9 - 3.11</td>
<td>Python 2.7<br />
Python 3.5 - 3.11<br />
PowerShell 3 - 5.1</td>
</tr>
<tr class="even">
<td><a href="https://github.com/ansible/ansible/blob/stable-2.13/changelogs/CHANGELOG-v2.13.rst">2.13</a></td>
<td>GA: 23 May 2022<br />
Critical: 07 Nov 2022<br />
Security: 22 May 2023</td>
<td><strong>EOL</strong><br />
06 Nov 2023</td>
<td>Python 3.8 - 3.10</td>
<td>Python 2.7<br />
Python 3.5 - 3.10<br />
PowerShell 3 - 5.1</td>
</tr>
<tr class="odd">
<td><a href="https://github.com/ansible/ansible/blob/stable-2.12/changelogs/CHANGELOG-v2.12.rst">2.12</a></td>
<td>GA: 08 Nov 2021<br />
Critical: 23 May 2022<br />
Security: 07 Nov 2022</td>
<td><strong>EOL</strong><br />
22 May 2023</td>
<td>Python 3.8 - 3.10</td>
<td>Python 2.6 - 2.7<br />
Python 3.5 - 3.10<br />
PowerShell 3 - 5.1</td>
</tr>
<tr class="even">
<td><a href="https://github.com/ansible/ansible/blob/stable-2.11/changelogs/CHANGELOG-v2.11.rst">2.11</a></td>
<td>GA: 26 Apr 2021<br />
Critical: 08 Nov 2021<br />
Security: 23 May 2022</td>
<td><strong>EOL</strong><br />
07 Nov 2022</td>
<td>Python 2.7<br />
Python 3.5 - 3.9</td>
<td>Python 2.6 - 2.7<br />
Python 3.5 - 3.9<br />
PowerShell 3 - 5.1</td>
</tr>
<tr class="odd">
<td><a href="https://github.com/ansible/ansible/blob/stable-2.10/changelogs/CHANGELOG-v2.10.rst">2.10</a></td>
<td>GA: 13 Aug 2020<br />
Critical: 26 Apr 2021<br />
Security: 08 Nov 2021</td>
<td><strong>EOL</strong><br />
23 May 2022</td>
<td>Python 2.7<br />
Python 3.5 - 3.9</td>
<td>Python 2.6 - 2.7<br />
Python 3.5 - 3.9<br />
PowerShell 3 - 5.1</td>
</tr>
<tr class="even">
<td><a href="https://github.com/ansible/ansible/blob/stable-2.9/changelogs/CHANGELOG-v2.9.rst">2.9</a></td>
<td>GA: 31 Oct 2019<br />
Critical: 13 Aug 2020<br />
Security: 26 Apr 2021</td>
<td><strong>EOL</strong><br />
23 May 2022</td>
<td>Python 2.7<br />
Python 3.5 - 3.8</td>
<td>Python 2.6 - 2.7<br />
Python 3.5 - 3.8<br />
PowerShell 3 - 5.1</td>
</tr>
</tbody>
</table>

### `ansible-core` versioning

The ansible-core project uses a historical versioning scheme, most similar to the versioning scheme used by Python.

This scheme follows the formatting of `X.Y.Z` which is described in detail below.

#### What is the `X` in `X.Y.Z`?

The `X` represents the internal architecture of `ansible-core`. The `X` here does not imply any form of compatibility, nor anything about the scope of the changes.

- `v1` can be best described as the internal architecture revolving around `ansible.runner.Runner` as the "execution" engine
- `v2` can be best described as the internal architecture revolving around the `TaskQueueManager`, `PlayIterator`, and the strategy as the "execution" engine

#### What is the `Y` in `X.Y.Z`?

Approximately every 6 months, in May and November ansible-core releases a new *Major* release. This is denoted by the `Y` in the `X.Y.Z` version scheme.

Although the `Y` denotes the Major version, it is not referenced independently, and instead a Major version is indicated in the format of `X.Y`, such as `2.16`.

As such, versions like `2.9.0`, `2.10.0`, `2.11.0`, `2.16.0` and `2.19.0` are all major releases. `X.Y.0` releases do not carry any guarantee of 100% backwards compatibility with the version before it. Some may be more or less impactful based on the scope of the work for the release. Check porting guides for changes that may necessitate user intervention.

#### What is the `Z` in `X.Y.Z`?

This is the patch version. ansible-core operates on a 4 week patch schedule. The `Z` release of a major version will include bugfixes and security fixes as outlined in the [Releases and maintenance](release_and_maintenance.md).

## Preparing for a new release

### Feature freezes

During final preparations for a new release, core developers and maintainers focus on improving the release candidate, not on adding or reviewing new features. We may impose a feature freeze.

A feature freeze means that we delay new features and fixes unrelated to the pending release so we can create the new release as soon as possible.

### Release candidates

We create at least one release candidate before each new major release of Ansible or `ansible-core`. Release candidates allow the Ansible community to try out new features, test existing playbooks on the release candidate, and report bugs or issues they find.

Ansible and `ansible-core` tag the first release candidate (RC1) which is usually scheduled to last five business days. If no major bugs or issues are identified during this period, the release candidate becomes the final release.

If there are major problems with the first candidate, the team and the community fix them and tag a second release candidate (RC2). This second candidate lasts for a shorter duration than the first. If no problems have been reported for an RC2 after two business days, the second release candidate becomes the final release.

If there are major problems in RC2, the cycle begins again with another release candidate and repeats until the maintainers agree that all major problems have been fixed.

## Development and maintenance workflows

In between releases, the Ansible community develops new features, maintains existing functionality, and fixes bugs in `ansible-core` and in the collections included in the Ansible community package.

### Ansible community package workflow

The Ansible community develops and maintains the features and functionality included in the Ansible community package in Collections repositories, with a workflow that looks like this:

> - Developers add new features and bug fixes to the individual Collections, following each Collection's rules on contributing.
> - Each new feature and each bug fix includes a changelog fragment describing the work.
> - Release engineers create a minor release for the current version every four weeks to ensure that the latest bug fixes are available to users.
> - At the end of the development period, the release engineers announce which Collections, and which major version of each included Collection, will be included in the next release of the Ansible community package. New Collections and new major versions may not be added after this, and the work of creating a new release begins.

We generally do not provide fixes for unmaintained releases of the Ansible community package, however, there can sometimes be exceptions for critical issues.

Some Collections are maintained by the Ansible team, some by Partner organizations, and some by community teams. For more information on adding features or fixing bugs in Ansible-maintained Collections, see contributing_maintained_collections.

### ansible-core workflow

The Ansible community develops and maintains `ansible-core` on [GitHub](https://github.com/ansible/ansible), with a workflow that looks like this:

> - Developers add new features and bug fixes to the `devel` branch.
> - Each new feature and each bug fix includes a changelog fragment describing the work.
> - The development team backports bug fixes to one, two, or three stable branches, depending on the severity of the bug. They do not backport new features.
> - Release engineers create a minor release for each maintained version every four weeks to ensure that the latest bug fixes are available to users.
> - At the end of the development period, the release engineers impose a feature freeze and the work of creating a new release begins.

We generally do not provide fixes for unmaintained releases of `ansible-core`, however, there can sometimes be exceptions for critical issues.

For more information about adding features or fixing bugs in `ansible-core` see community_development_process.

### Generating changelogs

We generate changelogs based on fragments. When creating new features for existing modules and plugins or fixing bugs, create a changelog fragment describing the change. A changelog entry is not needed for new modules or plugins. Details for those items will be generated from the module documentation.

To add changelog fragments to Collections in the Ansible community package, we recommend the [antsibull-changelog utility](https://github.com/ansible-community/antsibull-changelog/blob/main/docs/changelogs.rst).

To add changelog fragments for new features and bug fixes in `ansible-core`, see the changelog examples and instructions in the Community Guide.

## Deprecation cycles

Sometimes we remove a feature, normally in favor of a reimplementation that we hope does a better job. To do this we have a deprecation cycle. First we mark a feature as 'deprecated'. This is normally accompanied with warnings to the user as to why we deprecated it, what alternatives they should switch to and when (which version) we are scheduled to remove the feature permanently.

### Ansible community package deprecation cycle

Since Ansible is a package of individual collections, the deprecation cycle depends on the collection maintainers. We recommend the collection maintainers deprecate a feature in one Ansible major version and do not remove that feature for one year, or at least until the next major Ansible version. For example, deprecate the feature in 3.1.0 and do not remove the feature until 5.0.0 or 4.0.0 at the earliest. Collections should use semantic versioning, such that the major collection version cannot be changed within an Ansible major version. Therefore, the removal should not happen before the next major Ansible community package release. This is up to each collection maintainer and cannot be guaranteed.

### ansible-core deprecation cycle

The deprecation cycle in `ansible-core` is normally across 4 feature releases (2.x. where the x marks a feature release). The feature is normally removed in the 4th release after we announce the deprecation. For example, something deprecated in 2.10 will be removed in 2.13. The tracking is tied to the number of releases, not the release numbering itself. Although this is the standard, there are times where a deprecation cycle for a feature or behavior may have a longer or shorter deprecation cycle based on use or urgency of removal. Unintended or undocumented functionality may be removed without a deprecation cycle. In this context, unintended functionality refers specifically to emergent features that occur outside the release roadmap.


> [!NOTE]
>
> See also
> community_committer_guidelines
> Guidelines for Ansible Core contributors and maintainers
> [Testing Strategies](test_strategies.md)
> Testing strategies
> ansible_community_guide
> Community information and contributing
> Communication
> Got questions? Need help? Want to share your ideas? Visit the Ansible communication guide
