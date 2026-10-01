---
title: Running Ansible with the community EE image
product: ansible
source_url: https://docs.ansible.com/ansible/latest/getting_started_ee/run_community_ee_image.html
source_path: ansible/ansible-documentation:docs/docsite/rst/getting_started_ee/run_community_ee_image.rst
---

# Running Ansible with the community EE image

You can run ansible without the need to build a custom EE using community images.

Use the `community-ee-minimal` image that includes only `ansible-core` or the `community-ee-base` image that also includes several base collections.
Run the following command to see the collections included in the `community-ee-base` image:

``` bash
ansible-navigator collections --execution-environment-image ghcr.io/ansible-community/community-ee-base:latest
```

Run the following Ansible ad-hoc command against localhost inside the `community-ee-minimal` container:

``` bash
ansible-navigator exec "ansible localhost -m setup" --execution-environment-image ghcr.io/ansible-community/community-ee-minimal:latest --mode stdout
```

Now, create a simple test playbook and run it against `localhost` inside the container:

yaml/test_localhost.yml

``` bash
ansible-navigator run test_localhost.yml --execution-environment-image ghcr.io/ansible-community/community-ee-minimal:latest --mode stdout
```


> [!NOTE]
>
> See also
> \* [Building your first Execution Environment](build_execution_environment.md)
> \* [Running your EE](run_execution_environment.md)
> \* [Ansible Navigator documentation](https://ansible-navigator.readthedocs.io/)
