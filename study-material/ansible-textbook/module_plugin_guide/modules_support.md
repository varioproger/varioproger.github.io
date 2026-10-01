---
title: Module maintenance and support
product: ansible
source_url: https://docs.ansible.com/ansible/latest/module_plugin_guide/modules_support.html
source_path: ansible/ansible-documentation:docs/docsite/rst/module_plugin_guide/modules_support.rst
---

# Module maintenance and support

If you are using a module and you discover a bug, you may want to know where to report that bug, who is responsible for fixing it, and how you can track changes to the module. If you are a Red Hat subscriber, you may want to know whether you can get support for the issue you are facing.

Starting in Ansible 2.10, most modules live in collections. The distribution method for each collection reflects the maintenance and support for the modules in that collection.

## Maintenance

| Collection                    | Code location                                                                                       | Maintained by            |
|-------------------------------|-----------------------------------------------------------------------------------------------------|--------------------------|
| ansible.builtin               | [ansible/ansible repo](https://github.com/ansible/ansible/tree/devel/lib/ansible/modules) on GitHub | core team                |
| distributed on Galaxy         | various; follow `repo` link                                                                         | community or partners    |
| distributed on Automation Hub | various; follow `repo` link                                                                         | content team or partners |

## Issue Reporting

If you find a bug that affects a plugin in the main Ansible repo, also known as `ansible-core`:

> 1.  Confirm that you are running the latest stable version of Ansible or the devel branch.
> 2.  Look at the [issue tracker in the Ansible repo](https://github.com/ansible/ansible/issues) to see if an issue has already been filed.
> 3.  Create an issue if one does not already exist. Include as much detail as you can about the behavior you discovered.

If you find a bug that affects a plugin in a Galaxy collection:

> 1.  Find the collection on Galaxy.
> 2.  Find the issue tracker for the collection.
> 3.  Look there to see if an issue has already been filed.
> 4.  Create an issue if one does not already exist. Include as much detail as you can about the behavior you discovered.

Some partner collections may be hosted in private repositories.

If you are not sure whether the behavior you see is a bug, if you have questions, if you want to discuss development-oriented topics, or if you just want to get in touch, visit the Ansible communication guide for information on how to join the community.

If you find a bug that affects a module in an Automation Hub collection:

> 1.  If the collection offers an Issue Tracker link on Automation Hub, click there and open an issue on the collection repository. If it does not, follow the standard process for reporting issues on the [Red Hat Customer Portal](https://access.redhat.com/). You must have a subscription to the Red Hat Ansible Automation Platform to create an issue on the portal.

## Support

All plugins that remain in `ansible-core` and all collections hosted in Automation Hub are supported by Red Hat. No other plugins or collections are supported by Red Hat. If you have a subscription to the Red Hat Ansible Automation Platform, you can find more information and resources on the [Red Hat Customer Portal.](https://access.redhat.com/)


> [!NOTE]
>
> See also
> [Introduction to ad hoc commands](../command_guide/intro_adhoc.md)
> Examples of using modules in /usr/bin/ansible
> [Working with playbooks](../playbook_guide/playbooks.md)
> Examples of using modules with /usr/bin/ansible-playbook
> Communication
> Got questions? Need help? Want to share your ideas? Visit the Ansible communication guide
